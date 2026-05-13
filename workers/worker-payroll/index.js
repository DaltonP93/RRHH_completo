/**
 * worker-payroll — Procesador de liquidaciones de nómina en background
 *
 * Corre como proceso PM2 separado (cwd: api/).
 * Consume jobs de la tabla payroll_runs en estado 'queued'
 * y ejecuta el cálculo usando el motor de fórmulas parametrizables.
 *
 * Variables de entorno:
 *   PAYROLL_WORKER_INTERVAL_MS = 15000
 */

require('dotenv').config();
process.env.SERVICE_NAME = 'worker-payroll';

const { sequelize } = require('./src/config/database');
const logger = require('./src/config/logger');
const { calculateEmployeePayroll, persistPayrollItems } = require('./src/services/payrollFormulaEngine');

const INTERVAL_MS = parseInt(process.env.PAYROLL_WORKER_INTERVAL_MS || '15000');

// ─── Calcular un run completo ────────────────────────────────────
async function calculatePayrollRun(run) {
  logger.info(`Calculando nómina run #${run.id} — período ${run.period_year}/${run.period_month}`);

  await sequelize.query(
    "UPDATE payroll_runs SET status='calculating', started_at=NOW() WHERE id=?",
    { replacements: [run.id] }
  );

  try {
    const [employees] = await sequelize.query(`
      SELECT e.id FROM employees e
      INNER JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status = 'active'
      WHERE e.company_id = ? AND e.status = 'active'
    `, { replacements: [run.company_id] });

    let totalGross = 0;
    let totalNet = 0;
    let totalIpsEmployee = 0;
    let totalIpsEmployer = 0;
    let totalEmployees = 0;
    let errors = 0;

    for (const { id: employeeId } of employees) {
      try {
        const result = await calculateEmployeePayroll(
          employeeId, run.period_year, run.period_month,
          { companyId: run.company_id, payrollRunId: run.id }
        );
        await persistPayrollItems(run.id, result);

        totalGross       += result.gross_amount;
        totalNet         += result.net_amount;
        totalIpsEmployee += result.ips_employee;
        totalIpsEmployer += result.ips_employer;
        totalEmployees++;
      } catch (empErr) {
        errors++;
        logger.error(`Error calculando empleado #${employeeId} en run #${run.id}: ${empErr.message}`);
      }
    }

    await sequelize.query(`
      UPDATE payroll_runs SET
        status = 'calculated',
        finished_at = NOW(),
        total_employees = ?,
        total_gross = ?,
        total_net = ?,
        total_ips_employee = ?,
        total_ips_employer = ?
      WHERE id = ?
    `, { replacements: [totalEmployees, totalGross, totalNet, totalIpsEmployee, totalIpsEmployer, run.id] });

    logger.info(`Run #${run.id} completado: ${totalEmployees} empleados OK, ${errors} errores. Bruto=${totalGross}, Neto=${totalNet}`);
  } catch (err) {
    await sequelize.query(
      "UPDATE payroll_runs SET status='failed', error_message=?, finished_at=NOW() WHERE id=?",
      { replacements: [err.message, run.id] }
    );
    logger.error(`Error fatal en run #${run.id}: ${err.message}`);
  }
}

// ─── Poll de jobs ────────────────────────────────────────────────
async function processBatch() {
  try {
    const [runs] = await sequelize.query(`
      SELECT * FROM payroll_runs
      WHERE status = 'queued'
      ORDER BY queued_at ASC, created_at ASC
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
