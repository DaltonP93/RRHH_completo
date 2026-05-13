/**
 * worker-payroll — Procesador de liquidaciones de nómina en background
 *
 * Corre como proceso PM2 separado (cwd: api/).
 * Consume jobs de la tabla payroll_runs en estado 'queued'
 * y ejecuta el cálculo fuera del request HTTP.
 *
 * Variables de entorno:
 *   PAYROLL_WORKER_INTERVAL_MS = 15000
 */

require('dotenv').config();
process.env.SERVICE_NAME = 'worker-payroll';

const { sequelize } = require('./src/config/database');
const logger = require('./src/config/logger');

const INTERVAL_MS = parseInt(process.env.PAYROLL_WORKER_INTERVAL_MS || '15000');

// ─── Cálculo de nómina ──────────────────────────────────────────
async function calculatePayrollRun(run) {
  logger.info(`Calculando nómina run #${run.id} — período ${run.period_year}/${run.period_month}`);

  // Marcar como en proceso
  await sequelize.query(
    "UPDATE payroll_runs SET status='calculating', started_at=NOW() WHERE id=?",
    { replacements: [run.id] }
  );

  try {
    // Obtener conceptos salariales activos de la empresa
    const [concepts] = await sequelize.query(`
      SELECT sc.*, scg.name AS group_name
      FROM salary_concepts sc
      LEFT JOIN salary_concept_groups scg ON scg.id = sc.group_id
      WHERE (sc.company_id = ? OR sc.company_id IS NULL)
        AND sc.is_active = 1
      ORDER BY sc.priority_order ASC
    `, { replacements: [run.company_id] });

    // Obtener empleados activos del período
    const [employees] = await sequelize.query(`
      SELECT e.*, efc.salary_concept_id, efc.amount AS fixed_amount
      FROM employees e
      LEFT JOIN employee_fixed_concepts efc ON efc.employee_id = e.id AND efc.is_active = 1
      WHERE e.company_id = ? AND e.status = 'active'
    `, { replacements: [run.company_id] });

    // Agrupar conceptos fijos por empleado
    const empMap = {};
    for (const row of employees) {
      if (!empMap[row.id]) {
        empMap[row.id] = { ...row, fixedConcepts: [] };
      }
      if (row.salary_concept_id) {
        empMap[row.id].fixedConcepts.push({
          concept_id: row.salary_concept_id,
          amount: parseFloat(row.fixed_amount || 0),
        });
      }
    }

    // Leer parámetros IPS desde settings
    const [[ipsEmpSetting]] = await sequelize.query(
      "SELECT `value` FROM settings WHERE `key` = 'ips.employee_rate'"
    ).catch(() => [[{ value: '9' }]]);
    const [[ipsEmpRateSetting]] = await sequelize.query(
      "SELECT `value` FROM settings WHERE `key` = 'ips.employer_rate'"
    ).catch(() => [[{ value: '16.5' }]]);

    const ipsEmployeeRate = parseFloat(ipsEmpSetting?.value || '9') / 100;
    const ipsEmployerRate = parseFloat(ipsEmpRateSetting?.value || '16.5') / 100;

    let totalItems = 0;
    let totalGross = 0;
    let totalNet = 0;

    for (const emp of Object.values(empMap)) {
      try {
        // Calcular días trabajados en el período
        const [[attendance]] = await sequelize.query(`
          SELECT COUNT(DISTINCT DATE(timestamp)) AS days_worked,
                 SUM(CASE WHEN type='in' THEN 1 ELSE 0 END) AS total_in
          FROM attendance_logs
          WHERE employee_id = ?
            AND MONTH(timestamp) = ?
            AND YEAR(timestamp) = ?
        `, { replacements: [emp.id, run.period_month, run.period_year] });

        const daysWorked = attendance?.days_worked || 0;

        // Salary base
        const baseSalary = parseFloat(emp.salary_base || 0);
        if (baseSalary === 0) continue;

        // Calcular conceptos
        let grossAmount = baseSalary;
        let ipsBase = baseSalary;
        const itemsToInsert = [];

        // Concepto: sueldo base
        itemsToInsert.push({
          concept_code: 'SUELDO_BASE',
          concept_name: 'Sueldo Base',
          concept_type: 'INCOME',
          amount: baseSalary,
          affects_ips: 1,
        });

        // Conceptos fijos del empleado
        for (const fc of emp.fixedConcepts) {
          const concept = concepts.find(c => c.id === fc.concept_id);
          if (!concept) continue;
          const amount = fc.amount;
          if (concept.concept_type === 'INCOME') {
            grossAmount += amount;
            if (concept.affects_ips) ipsBase += amount;
          } else if (concept.concept_type === 'DEDUCTION') {
            grossAmount -= amount;
          }
          itemsToInsert.push({
            concept_code: concept.code,
            concept_name: concept.name,
            concept_type: concept.concept_type,
            amount,
            affects_ips: concept.affects_ips,
          });
        }

        // IPS empleado (deducción)
        const ipsEmployee = Math.round(ipsBase * ipsEmployeeRate);
        itemsToInsert.push({
          concept_code: 'IPS_EMPLEADO',
          concept_name: 'Aporte IPS Empleado',
          concept_type: 'DEDUCTION',
          amount: ipsEmployee,
          affects_ips: 0,
        });

        // IPS patronal (contribución empresa — no descuenta del neto del empleado)
        const ipsEmployer = Math.round(ipsBase * ipsEmployerRate);
        itemsToInsert.push({
          concept_code: 'IPS_PATRONAL',
          concept_name: 'Aporte IPS Patronal',
          concept_type: 'CONTRIBUTION',
          amount: ipsEmployer,
          affects_ips: 0,
        });

        const netAmount = grossAmount - ipsEmployee;

        // Insertar items de nómina
        for (const item of itemsToInsert) {
          await sequelize.query(`
            INSERT INTO payroll_items
              (payroll_run_id, employee_id, concept_code, concept_name, concept_type,
               amount, affects_ips, days_worked, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE amount = VALUES(amount)
          `, { replacements: [
            run.id, emp.id, item.concept_code, item.concept_name,
            item.concept_type, item.amount, item.affects_ips, daysWorked
          ]});
        }

        totalItems++;
        totalGross += grossAmount;
        totalNet += netAmount;

      } catch (empErr) {
        logger.error(`Error calculando nómina empleado #${emp.id}: ${empErr.message}`);
      }
    }

    // Actualizar run
    await sequelize.query(`
      UPDATE payroll_runs SET
        status = 'calculated',
        finished_at = NOW(),
        total_employees = ?,
        total_gross = ?,
        total_net = ?
      WHERE id = ?
    `, { replacements: [totalItems, totalGross, totalNet, run.id] });

    logger.info(`Nómina run #${run.id} calculada: ${totalItems} empleados, bruto=${totalGross}, neto=${totalNet}`);
  } catch (err) {
    await sequelize.query(
      "UPDATE payroll_runs SET status='failed', error_message=?, finished_at=NOW() WHERE id=?",
      { replacements: [err.message, run.id] }
    );
    logger.error(`Error calculando nómina run #${run.id}: ${err.message}`);
  }
}

// ─── Poll de jobs ────────────────────────────────────────────────
async function processBatch() {
  try {
    const [runs] = await sequelize.query(`
      SELECT * FROM payroll_runs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 3
      FOR UPDATE SKIP LOCKED
    `);

    for (const run of runs) {
      await calculatePayrollRun(run);
    }
  } catch (err) {
    logger.error('Error en poll payroll: ' + err.message);
  }
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  logger.info('worker-payroll iniciado');
  await sequelize.authenticate();
  logger.info(`Poll cada ${INTERVAL_MS / 1000}s`);

  await processBatch();
  setInterval(processBatch, INTERVAL_MS);
}

main().catch(err => {
  logger.error('worker-payroll error fatal: ' + err.message);
  process.exit(1);
});
