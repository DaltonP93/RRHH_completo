/**
 * payrollRuns.js — Payroll runs (liquidaciones), settlements, approvals.
 *
 * Routes:
 *   GET/POST              /api/payroll-runs
 *   GET                   /api/payroll-runs/:id
 *   POST                  /api/payroll-runs/:id/calculate
 *   GET                   /api/payroll-runs/:id/settlements
 *   GET/PUT               /api/payroll-runs/:id/settlements/:settlementId
 *   POST                  /api/payroll-runs/:id/approve
 *   POST                  /api/payroll-runs/:id/close
 *   POST                  /api/payroll-runs/:id/reopen
 *   GET                   /api/payroll-runs/:id/summary
 *   GET                   /api/payroll-runs/:id/ips-export
 *   GET                   /api/payroll-runs/:id/mtess-export
 *   GET/POST              /api/settlement-types
 *   GET/POST/PUT          /api/payroll-monthly-parameters
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { calculateEmployeePayroll } = require('../services/payrollFormulaEngine');

router.use(authenticate);

// ─── Payroll Runs ────────────────────────────────────────────────────────────

// GET /api/payroll-runs — list with filters
router.get('/', async (req, res) => {
  try {
    const { year, month, status, company_id } = req.query;
    let sql = `
      SELECT pr.*,
             c.legal_name AS company_name,
             c.trade_name AS company_trade_name,
             b.name AS branch_name,
             st.name AS settlement_type_name,
             COUNT(es.id) AS settlement_count,
             SUM(es.net_pay) AS total_net_pay
      FROM payroll_runs pr
      LEFT JOIN companies c ON c.id = pr.company_id
      LEFT JOIN branches b ON b.id = pr.branch_id
      LEFT JOIN settlement_types st ON st.id = pr.settlement_type_id
      LEFT JOIN employee_settlements es ON es.payroll_run_id = pr.id
      WHERE 1=1
    `;
    const replacements = [];
    if (year)       { sql += ' AND pr.period_year = ?';   replacements.push(year); }
    if (month)      { sql += ' AND pr.period_month = ?';  replacements.push(month); }
    if (status)     { sql += ' AND pr.status = ?';        replacements.push(status); }
    if (company_id) { sql += ' AND pr.company_id = ?';    replacements.push(company_id); }
    sql += ' GROUP BY pr.id ORDER BY pr.period_year DESC, pr.period_month DESC, pr.created_at DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/payroll-runs error:', err);
    res.status(500).json({ error: 'Error al obtener liquidaciones' });
  }
});

// POST /api/payroll-runs — create new run
router.post('/', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      company_id, branch_id, period_year, period_month,
      period_start, period_end, settlement_type_id, description
    } = req.body;

    if (!company_id || !period_year || !period_month || !period_start || !period_end) {
      return res.status(400).json({ error: 'company_id, period_year, period_month, period_start y period_end son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO payroll_runs
        (company_id, branch_id, period_year, period_month, period_start, period_end,
         settlement_type_id, description, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NOW(), NOW())
    `, { replacements: [
      company_id, branch_id || null, period_year, period_month,
      period_start, period_end, settlement_type_id || null,
      description || null, req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/payroll-runs error:', err);
    res.status(500).json({ error: 'Error al crear liquidación' });
  }
});

// GET /api/payroll-runs/:id — run detail with settlements summary
router.get('/:id', async (req, res) => {
  try {
    const [runs] = await sequelize.query(`
      SELECT pr.*,
             c.legal_name AS company_name, c.trade_name, c.ruc,
             b.name AS branch_name,
             st.name AS settlement_type_name
      FROM payroll_runs pr
      LEFT JOIN companies c ON c.id = pr.company_id
      LEFT JOIN branches b ON b.id = pr.branch_id
      LEFT JOIN settlement_types st ON st.id = pr.settlement_type_id
      WHERE pr.id = ?
    `, { replacements: [req.params.id] });

    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const [summary] = await sequelize.query(`
      SELECT
        COUNT(*) AS employee_count,
        SUM(gross_income) AS total_gross,
        SUM(total_deductions) AS total_deductions,
        SUM(ips_employee_amount) AS total_ips_employee,
        SUM(ips_employer_amount) AS total_ips_employer,
        SUM(net_pay) AS total_net
      FROM employee_settlements
      WHERE payroll_run_id = ?
    `, { replacements: [req.params.id] });

    res.json({ ...runs[0], summary: summary[0] });
  } catch (err) {
    console.error('GET /api/payroll-runs/:id error:', err);
    res.status(500).json({ error: 'Error al obtener liquidación' });
  }
});

// POST /api/payroll-runs/:id/calculate — calculate all settlements
router.post('/:id/calculate', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query(
      'SELECT * FROM payroll_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });
    const run = runs[0];

    if (['approved', 'closed'].includes(run.status)) {
      return res.status(400).json({ error: `No se puede recalcular una liquidación en estado '${run.status}'` });
    }

    // Get active employees for company (optionally filtered by branch)
    let empSql = `
      SELECT e.*,
             pp.base_salary, pp.payment_method, pp.bank_id, pp.bank_account_number,
             pp.id AS profile_id
      FROM employees e
      LEFT JOIN payroll_profiles pp
        ON pp.employee_id = e.id
        AND pp.status = 'active'
        AND pp.valid_from <= ?
        AND (pp.valid_to IS NULL OR pp.valid_to >= ?)
      WHERE e.status = 'active' AND e.company_id = ?
    `;
    const empReplacements = [run.period_end, run.period_start, run.company_id];
    if (run.branch_id) {
      empSql += ' AND e.branch_id = ?';
      empReplacements.push(run.branch_id);
    }

    const [employees] = await sequelize.query(empSql, { replacements: empReplacements });

    let calculatedCount = 0;
    let errorCount = 0;

    for (const emp of employees) {
      try {
        const baseSalary = parseFloat(emp.base_salary || 0);

        // Get worked days from attendance
        const [attRows] = await sequelize.query(`
          SELECT COUNT(*) AS days,
                 COALESCE(SUM(worked_minutes), 0) AS total_minutes,
                 COALESCE(SUM(overtime_minutes), 0) AS overtime_minutes
          FROM attendance_days
          WHERE employee_id = ? AND work_date BETWEEN ? AND ? AND status = 'present'
        `, { replacements: [emp.id, run.period_start, run.period_end] });

        const workedDays = parseInt(attRows[0]?.days || 0) || 26;
        const totalDays = 30;

        // Get fixed earning concepts
        const [fixedConcepts] = await sequelize.query(`
          SELECT efc.amount, efc.percentage, sc.type, sc.affects_ips,
                 sc.affects_christmas_bonus, sc.calculation_type, sc.name AS concept_name
          FROM employee_fixed_concepts efc
          JOIN salary_concepts sc ON sc.id = efc.salary_concept_id
          WHERE efc.employee_id = ?
            AND efc.status = 'active'
            AND (efc.valid_from IS NULL OR efc.valid_from <= ?)
            AND (efc.valid_to IS NULL OR efc.valid_to >= ?)
        `, { replacements: [emp.id, run.period_end, run.period_start] });

        // Calculate proportional base salary
        const dailySalary = baseSalary / totalDays;
        const earnedSalary = dailySalary * workedDays;

        // Sum fixed earning additions
        let additionalEarnings = 0;
        let additionalDeductions = 0;
        for (const concept of fixedConcepts) {
          const amount = concept.calculation_type === 'percentage'
            ? earnedSalary * (parseFloat(concept.percentage || 0) / 100)
            : parseFloat(concept.amount || 0);
          if (concept.type === 'earning') {
            additionalEarnings += amount;
          } else if (concept.type === 'deduction') {
            additionalDeductions += amount;
          }
        }

        // IPS calculation (9% employee, 16.5% employer)
        const ipsBase = earnedSalary + additionalEarnings;
        const ipsEmployee = parseFloat((ipsBase * 0.09).toFixed(2));
        const ipsEmployer = parseFloat((ipsBase * 0.165).toFixed(2));

        const grossIncome = parseFloat((ipsBase).toFixed(2));
        const totalDeductions = parseFloat((ipsEmployee + additionalDeductions).toFixed(2));
        const netPay = parseFloat((grossIncome - totalDeductions).toFixed(2));

        // Upsert settlement
        await sequelize.query(`
          INSERT INTO employee_settlements
            (payroll_run_id, employee_id, payroll_profile_id, worked_days, gross_income,
             total_deductions, ips_employee_amount, ips_employer_amount, net_pay,
             payment_method, bank_id, bank_account_number, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'calculated', NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            payroll_profile_id    = VALUES(payroll_profile_id),
            worked_days           = VALUES(worked_days),
            gross_income          = VALUES(gross_income),
            total_deductions      = VALUES(total_deductions),
            ips_employee_amount   = VALUES(ips_employee_amount),
            ips_employer_amount   = VALUES(ips_employer_amount),
            net_pay               = VALUES(net_pay),
            status                = 'calculated',
            updated_at            = NOW()
        `, { replacements: [
          run.id, emp.id, emp.profile_id || null, workedDays, grossIncome,
          totalDeductions, ipsEmployee, ipsEmployer, netPay,
          emp.payment_method || 'BANCO', emp.bank_id || null, emp.bank_account_number || null
        ]});

        calculatedCount++;
      } catch (empErr) {
        console.error(`Error calculando empleado ${emp.id}:`, empErr);
        errorCount++;
      }
    }

    // Update run status
    await sequelize.query(`
      UPDATE payroll_runs
      SET status = 'calculated', calculated_at = NOW(), calculated_by = ?, updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, run.id] });

    res.json({
      message: 'Cálculo completado',
      calculated: calculatedCount,
      errors: errorCount,
      total_employees: employees.length
    });
  } catch (err) {
    console.error('POST /api/payroll-runs/:id/calculate error:', err);
    res.status(500).json({ error: 'Error al calcular liquidación' });
  }
});

// GET /api/payroll-runs/:id/settlements — list employee settlements
router.get('/:id/settlements', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT es.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.code AS employee_code,
             b.name AS bank_name
      FROM employee_settlements es
      JOIN employees e ON e.id = es.employee_id
      LEFT JOIN banks b ON b.id = es.bank_id
      WHERE es.payroll_run_id = ?
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [req.params.id] });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/payroll-runs/:id/settlements error:', err);
    res.status(500).json({ error: 'Error al obtener liquidaciones de empleados' });
  }
});

// GET /api/payroll-runs/:id/settlements/:settlementId — settlement detail with lines
router.get('/:id/settlements/:settlementId', async (req, res) => {
  try {
    const [settlements] = await sequelize.query(`
      SELECT es.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.code AS employee_code,
             e.position_id, p.name AS position_name,
             b.name AS bank_name
      FROM employee_settlements es
      JOIN employees e ON e.id = es.employee_id
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN banks b ON b.id = es.bank_id
      WHERE es.id = ? AND es.payroll_run_id = ?
    `, { replacements: [req.params.settlementId, req.params.id] });

    if (!settlements.length) return res.status(404).json({ error: 'Liquidación de empleado no encontrada' });

    const [lines] = await sequelize.query(`
      SELECT sl.*, sc.name AS concept_name, sc.type AS concept_type, sc.affects_ips
      FROM settlement_lines sl
      LEFT JOIN salary_concepts sc ON sc.id = sl.salary_concept_id
      WHERE sl.employee_settlement_id = ?
      ORDER BY sc.type ASC, sl.sort_order ASC
    `, { replacements: [req.params.settlementId] });

    res.json({ ...settlements[0], lines });
  } catch (err) {
    console.error('GET /api/payroll-runs/:id/settlements/:settlementId error:', err);
    res.status(500).json({ error: 'Error al obtener detalle de liquidación' });
  }
});

// PUT /api/payroll-runs/:id/settlements/:settlementId — update settlement manually
router.put('/:id/settlements/:settlementId', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { worked_days, gross_income, total_deductions, ips_employee_amount, ips_employer_amount, net_pay, notes } = req.body;

    await sequelize.query(`
      UPDATE employee_settlements SET
        worked_days           = COALESCE(?, worked_days),
        gross_income          = COALESCE(?, gross_income),
        total_deductions      = COALESCE(?, total_deductions),
        ips_employee_amount   = COALESCE(?, ips_employee_amount),
        ips_employer_amount   = COALESCE(?, ips_employer_amount),
        net_pay               = COALESCE(?, net_pay),
        notes                 = COALESCE(?, notes),
        status                = 'adjusted',
        updated_at            = NOW()
      WHERE id = ? AND payroll_run_id = ?
    `, { replacements: [
      worked_days ?? null, gross_income ?? null, total_deductions ?? null,
      ips_employee_amount ?? null, ips_employer_amount ?? null, net_pay ?? null,
      notes || null, req.params.settlementId, req.params.id
    ]});

    const [row] = await sequelize.query(
      'SELECT * FROM employee_settlements WHERE id = ?',
      { replacements: [req.params.settlementId] }
    );
    if (!row.length) return res.status(404).json({ error: 'Liquidación no encontrada' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/payroll-runs/:id/settlements/:settlementId error:', err);
    res.status(500).json({ error: 'Error al actualizar liquidación de empleado' });
  }
});

// POST /api/payroll-runs/:id/approve
router.post('/:id/approve', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });
    if (!['calculated', 'review'].includes(runs[0].status)) {
      return res.status(400).json({ error: 'Solo se pueden aprobar liquidaciones calculadas o en revisión' });
    }

    await sequelize.query(`
      UPDATE payroll_runs
      SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, req.params.id] });

    const [updated] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    res.json(updated[0]);
  } catch (err) {
    console.error('POST /api/payroll-runs/:id/approve error:', err);
    res.status(500).json({ error: 'Error al aprobar liquidación' });
  }
});

// POST /api/payroll-runs/:id/close
router.post('/:id/close', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });
    if (runs[0].status !== 'approved') {
      return res.status(400).json({ error: 'Solo se pueden cerrar liquidaciones aprobadas' });
    }

    await sequelize.query(`
      UPDATE payroll_runs
      SET status = 'closed', closed_by = ?, closed_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, req.params.id] });

    const [updated] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    res.json(updated[0]);
  } catch (err) {
    console.error('POST /api/payroll-runs/:id/close error:', err);
    res.status(500).json({ error: 'Error al cerrar liquidación' });
  }
});

// POST /api/payroll-runs/:id/reopen — reopen approved run back to 'review'
router.post('/:id/reopen', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });
    if (runs[0].status === 'closed') {
      return res.status(400).json({ error: 'No se puede reabrir una liquidación cerrada' });
    }

    await sequelize.query(`
      UPDATE payroll_runs
      SET status = 'review', approved_by = NULL, approved_at = NULL, updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.params.id] });

    const [updated] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    res.json(updated[0]);
  } catch (err) {
    console.error('POST /api/payroll-runs/:id/reopen error:', err);
    res.status(500).json({ error: 'Error al reabrir liquidación' });
  }
});

// GET /api/payroll-runs/:id/summary
router.get('/:id/summary', async (req, res) => {
  try {
    const [runs] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const [summary] = await sequelize.query(`
      SELECT
        COUNT(*) AS employee_count,
        SUM(worked_days) AS total_worked_days,
        SUM(gross_income) AS total_gross,
        SUM(total_deductions) AS total_deductions,
        SUM(ips_employee_amount) AS total_ips_employee,
        SUM(ips_employer_amount) AS total_ips_employer,
        SUM(net_pay) AS total_net,
        SUM(gross_income + ips_employer_amount) AS total_employer_cost
      FROM employee_settlements
      WHERE payroll_run_id = ?
    `, { replacements: [req.params.id] });

    res.json({ run: runs[0], summary: summary[0] });
  } catch (err) {
    console.error('GET /api/payroll-runs/:id/summary error:', err);
    res.status(500).json({ error: 'Error al obtener resumen de liquidación' });
  }
});

// GET /api/payroll-runs/:id/ips-export
router.get('/:id/ips-export', async (req, res) => {
  try {
    const [runs] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const [rows] = await sequelize.query(`
      SELECT
        e.document_number,
        CONCAT(e.last_name, ', ', e.first_name) AS employee_name,
        e.ips_number,
        es.gross_income AS salary_base,
        es.ips_employee_amount AS contribution_employee,
        es.ips_employer_amount AS contribution_employer,
        (es.ips_employee_amount + es.ips_employer_amount) AS total_contribution,
        es.worked_days
      FROM employee_settlements es
      JOIN employees e ON e.id = es.employee_id
      WHERE es.payroll_run_id = ?
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [req.params.id] });

    res.json({
      run_id: runs[0].id,
      period_year: runs[0].period_year,
      period_month: runs[0].period_month,
      records: rows
    });
  } catch (err) {
    console.error('GET /api/payroll-runs/:id/ips-export error:', err);
    res.status(500).json({ error: 'Error al exportar datos IPS' });
  }
});

// GET /api/payroll-runs/:id/mtess-export
// Query: format = reop_xlsx | sueldos_csv | resumen_json (default: resumen_json)
router.get('/:id/mtess-export', async (req, res) => {
  try {
    const { generateReop, generateSueldosCsv, generateResumenJson } = require('../services/mtessExporter');

    const [[run]] = await sequelize.query('SELECT * FROM payroll_runs WHERE id = ?', { replacements: [req.params.id] });
    if (!run) return res.status(404).json({ error: 'Liquidación no encontrada' });

    // Preferir payroll_items si hay datos del motor de fórmulas
    let rows = [];
    const [settlements] = await sequelize.query(`
      SELECT
        e.document_number, e.first_name, e.last_name, e.hire_date, e.ips_number,
        p.name AS position_name,
        es.gross_income, es.worked_days, es.net_pay,
        es.ips_employee_amount, es.ips_employer_amount
      FROM employee_settlements es
      JOIN employees e ON e.id = es.employee_id
      LEFT JOIN positions p ON p.id = e.position_id
      WHERE es.payroll_run_id = ?
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [run.id] });

    if (settlements.length) {
      rows = settlements;
    } else {
      // Fallback: leer desde payroll_items agrupado
      const [items] = await sequelize.query(`
        SELECT
          pi.employee_id,
          e.document_number, e.first_name, e.last_name, e.hire_date, e.ips_number,
          pos.name AS position_name,
          SUM(CASE WHEN pi.concept_type='INCOME' THEN pi.amount ELSE 0 END) AS gross_income,
          MAX(pi.days_worked) AS worked_days,
          SUM(CASE WHEN pi.concept_code='IPS_EMPLEADO' THEN pi.amount ELSE 0 END) AS ips_employee_amount,
          SUM(CASE WHEN pi.concept_code='IPS_PATRONAL' THEN pi.amount ELSE 0 END) AS ips_employer_amount
        FROM payroll_items pi
        JOIN employees e ON e.id = pi.employee_id
        LEFT JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status='active'
        LEFT JOIN positions pos ON pos.id = e.position_id
        WHERE pi.payroll_run_id = ?
        GROUP BY pi.employee_id
        ORDER BY e.last_name ASC, e.first_name ASC
      `, { replacements: [run.id] });

      rows = items.map(r => ({
        ...r,
        net_pay: r.gross_income - r.ips_employee_amount,
      }));
    }

    const [[company]] = await sequelize.query(
      'SELECT * FROM companies WHERE id = ?', { replacements: [run.company_id || 1] }
    ).catch(() => [[{}]]);

    const fmt = req.query.format || 'resumen_json';
    const dateStr = `${run.period_year}${String(run.period_month).padStart(2, '0')}`;

    if (fmt === 'reop_xlsx') {
      const buffer = await generateReop(run, rows, company);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="REOP_${dateStr}.xlsx"`);
      return res.send(buffer);
    }

    if (fmt === 'sueldos_csv') {
      const buffer = generateSueldosCsv(run, rows);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="MTESS_Sueldos_${dateStr}.txt"`);
      return res.send(buffer);
    }

    // resumen_json (default)
    const resumen = generateResumenJson(run, rows);
    res.json({
      run_id: run.id,
      period_year: run.period_year,
      period_month: run.period_month,
      resumen,
      records: rows,
    });
  } catch (err) {
    console.error('GET /api/payroll-runs/:id/mtess-export error:', err);
    res.status(500).json({ error: 'Error al exportar datos MTESS' });
  }
});

// POST /api/payroll-runs/:id/queue — encolar para procesamiento en background
router.post('/:id/queue', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [[run]] = await sequelize.query(
      'SELECT * FROM payroll_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!run) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const blocked = ['queued', 'calculating', 'approved', 'closed'];
    if (blocked.includes(run.status)) {
      return res.status(400).json({ error: `No se puede encolar en estado '${run.status}'` });
    }

    await sequelize.query(
      "UPDATE payroll_runs SET status='queued', queued_at=NOW(), queued_by=? WHERE id=?",
      { replacements: [req.user.id, run.id] }
    );

    res.json({ message: 'Liquidación encolada para procesamiento', run_id: run.id });
  } catch (err) {
    console.error('POST /api/payroll-runs/:id/queue error:', err);
    res.status(500).json({ error: 'Error al encolar liquidación' });
  }
});

// GET /api/payroll-runs/:id/preview/:employeeId — preview de nómina sin persistir
router.get('/:id/preview/:employeeId', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [[run]] = await sequelize.query(
      'SELECT * FROM payroll_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!run) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const result = await calculateEmployeePayroll(
      parseInt(req.params.employeeId),
      run.period_year,
      run.period_month,
      { companyId: run.company_id }
    );

    res.json(result);
  } catch (err) {
    console.error('GET /api/payroll-runs/:id/preview/:employeeId error:', err);
    res.status(500).json({ error: 'Error al calcular preview de nómina' });
  }
});

// GET /api/payroll-runs/:id/preview — preview completo de todos los empleados
router.get('/:id/preview', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [[run]] = await sequelize.query(
      'SELECT * FROM payroll_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!run) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const [employees] = await sequelize.query(`
      SELECT e.id FROM employees e
      INNER JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status = 'active'
      WHERE e.company_id = ? AND e.status = 'active'
    `, { replacements: [run.company_id] });

    const results = [];
    let totalGross = 0, totalNet = 0, totalIpsEmployee = 0, totalIpsEmployer = 0;

    for (const { id: employeeId } of employees) {
      try {
        const r = await calculateEmployeePayroll(
          employeeId, run.period_year, run.period_month,
          { companyId: run.company_id }
        );
        results.push(r);
        totalGross       += r.gross_amount;
        totalNet         += r.net_amount;
        totalIpsEmployee += r.ips_employee;
        totalIpsEmployer += r.ips_employer;
      } catch (e) {
        results.push({ employee_id: employeeId, error: e.message });
      }
    }

    res.json({
      run_id: run.id,
      period: `${run.period_year}/${String(run.period_month).padStart(2, '0')}`,
      total_employees: employees.length,
      totals: {
        gross: totalGross,
        net: totalNet,
        ips_employee: totalIpsEmployee,
        ips_employer: totalIpsEmployer,
      },
      employees: results,
    });
  } catch (err) {
    console.error('GET /api/payroll-runs/:id/preview error:', err);
    res.status(500).json({ error: 'Error al calcular preview de nómina' });
  }
});

module.exports = router;
