/**
 * compliance.js — MTESS and IPS compliance management.
 *
 * Routes:
 *   GET/POST              /api/compliance/mtess
 *   GET/PUT               /api/compliance/mtess/:id
 *   POST                  /api/compliance/mtess/generate-entry/:employeeId
 *   POST                  /api/compliance/mtess/generate-exit/:employeeId
 *   POST                  /api/compliance/mtess/generate-payroll/:payrollRunId
 *   GET                   /api/compliance/ips
 *   POST                  /api/compliance/ips/calculate/:payrollRunId
 *   GET                   /api/compliance/ips/export/:year/:month
 *   GET/POST              /api/compliance/labor-planillas
 *   PUT                   /api/compliance/labor-planillas/:id
 *   GET                   /api/compliance/labor-planillas/:id/generate
 *   GET/PUT               /api/compliance/social-security-rates
 *   PUT                   /api/compliance/social-security-rates/:id
 *   GET                   /api/compliance/status
 *   GET                   /api/compliance/calendar
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── MTESS Communications ────────────────────────────────────────────────────

// GET /api/compliance/mtess — list with filters
router.get('/mtess', async (req, res) => {
  try {
    const { company_id, type, status, year, month } = req.query;
    let sql = `
      SELECT mc.*,
             c.legal_name AS company_name,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number
      FROM mtess_communications mc
      LEFT JOIN companies c ON c.id = mc.company_id
      LEFT JOIN employees e ON e.id = mc.employee_id
      WHERE 1=1
    `;
    const replacements = [];
    if (company_id) { sql += ' AND mc.company_id = ?';          replacements.push(company_id); }
    if (type)       { sql += ' AND mc.communication_type = ?';   replacements.push(type); }
    if (status)     { sql += ' AND mc.status = ?';               replacements.push(status); }
    if (year)       { sql += ' AND YEAR(mc.period_date) = ?';    replacements.push(year); }
    if (month)      { sql += ' AND MONTH(mc.period_date) = ?';   replacements.push(month); }
    sql += ' ORDER BY mc.created_at DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('GET /api/compliance/mtess error:', err);
    res.status(500).json({ error: 'Error al obtener comunicaciones MTESS' });
  }
});

// POST /api/compliance/mtess — create communication record
router.post('/mtess', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      company_id, employee_id, communication_type, period_date,
      submission_date, reference_number, observations, payroll_run_id
    } = req.body;

    if (!company_id || !communication_type) {
      return res.status(400).json({ error: 'company_id y communication_type son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO mtess_communications
        (company_id, employee_id, communication_type, period_date, submission_date,
         reference_number, observations, payroll_run_id, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())
    `, { replacements: [
      company_id, employee_id || null, communication_type, period_date || null,
      submission_date || null, reference_number || null, observations || null,
      payroll_run_id || null, req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM mtess_communications WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/compliance/mtess error:', err);
    res.status(500).json({ error: 'Error al crear comunicación MTESS' });
  }
});

// PUT /api/compliance/mtess/:id
router.put('/mtess/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { status, submission_date, reference_number, observations } = req.body;

    await sequelize.query(`
      UPDATE mtess_communications SET
        status           = COALESCE(?, status),
        submission_date  = COALESCE(?, submission_date),
        reference_number = COALESCE(?, reference_number),
        observations     = COALESCE(?, observations),
        updated_at       = NOW()
      WHERE id = ?
    `, { replacements: [status || null, submission_date || null, reference_number || null, observations || null, req.params.id] });

    const [row] = await sequelize.query('SELECT * FROM mtess_communications WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Comunicación MTESS no encontrada' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/compliance/mtess/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar comunicación MTESS' });
  }
});

// GET /api/compliance/mtess/:id
router.get('/mtess/:id', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT mc.*,
             c.legal_name AS company_name, c.patronal_number_mtess,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.ips_number, e.hire_date, e.termination_date
      FROM mtess_communications mc
      LEFT JOIN companies c ON c.id = mc.company_id
      LEFT JOIN employees e ON e.id = mc.employee_id
      WHERE mc.id = ?
    `, { replacements: [req.params.id] });

    if (!rows.length) return res.status(404).json({ error: 'Comunicación MTESS no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/compliance/mtess/:id error:', err);
    res.status(500).json({ error: 'Error al obtener comunicación MTESS' });
  }
});

// POST /api/compliance/mtess/generate-entry/:employeeId — ALTA communication
router.post('/mtess/generate-entry/:employeeId', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [employees] = await sequelize.query(`
      SELECT e.*, c.patronal_number_mtess, c.id AS company_id, c.legal_name AS company_name
      FROM employees e
      JOIN companies c ON c.id = e.company_id
      WHERE e.id = ?
    `, { replacements: [req.params.employeeId] });

    if (!employees.length) return res.status(404).json({ error: 'Empleado no encontrado' });
    const emp = employees[0];

    const [result] = await sequelize.query(`
      INSERT INTO mtess_communications
        (company_id, employee_id, communication_type, period_date,
         observations, status, created_by, created_at, updated_at)
      VALUES (?, ?, 'ALTA', ?, ?, 'pending', ?, NOW(), NOW())
    `, { replacements: [
      emp.company_id, emp.id, emp.hire_date,
      `Alta de empleado: ${emp.first_name} ${emp.last_name} - CI: ${emp.document_number}`,
      req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM mtess_communications WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/compliance/mtess/generate-entry error:', err);
    res.status(500).json({ error: 'Error al generar comunicación de ALTA' });
  }
});

// POST /api/compliance/mtess/generate-exit/:employeeId — BAJA communication
router.post('/mtess/generate-exit/:employeeId', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { termination_date, termination_reason } = req.body;

    const [employees] = await sequelize.query(`
      SELECT e.*, c.id AS company_id
      FROM employees e
      JOIN companies c ON c.id = e.company_id
      WHERE e.id = ?
    `, { replacements: [req.params.employeeId] });

    if (!employees.length) return res.status(404).json({ error: 'Empleado no encontrado' });
    const emp = employees[0];

    const exitDate = termination_date || emp.termination_date;
    if (!exitDate) {
      return res.status(400).json({ error: 'Se requiere termination_date para generar BAJA' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO mtess_communications
        (company_id, employee_id, communication_type, period_date,
         observations, status, created_by, created_at, updated_at)
      VALUES (?, ?, 'BAJA', ?, ?, 'pending', ?, NOW(), NOW())
    `, { replacements: [
      emp.company_id, emp.id, exitDate,
      `Baja de empleado: ${emp.first_name} ${emp.last_name} - Motivo: ${termination_reason || 'No especificado'}`,
      req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM mtess_communications WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/compliance/mtess/generate-exit error:', err);
    res.status(500).json({ error: 'Error al generar comunicación de BAJA' });
  }
});

// POST /api/compliance/mtess/generate-payroll/:payrollRunId — LIQUIDACION communication
router.post('/mtess/generate-payroll/:payrollRunId', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query(`
      SELECT pr.*, c.patronal_number_mtess
      FROM payroll_runs pr
      JOIN companies c ON c.id = pr.company_id
      WHERE pr.id = ?
    `, { replacements: [req.params.payrollRunId] });

    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });
    const run = runs[0];

    // Check no duplicate
    const [existing] = await sequelize.query(
      "SELECT id FROM mtess_communications WHERE payroll_run_id = ? AND communication_type = 'LIQUIDACION'",
      { replacements: [run.id] }
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Ya existe una comunicación MTESS para esta liquidación' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO mtess_communications
        (company_id, communication_type, period_date, payroll_run_id,
         observations, status, created_by, created_at, updated_at)
      VALUES (?, 'LIQUIDACION', ?, ?, ?, 'pending', ?, NOW(), NOW())
    `, { replacements: [
      run.company_id,
      `${run.period_year}-${String(run.period_month).padStart(2, '0')}-01`,
      run.id,
      `Liquidación período ${run.period_month}/${run.period_year}`,
      req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM mtess_communications WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/compliance/mtess/generate-payroll error:', err);
    res.status(500).json({ error: 'Error al generar comunicación MTESS de liquidación' });
  }
});

// ─── IPS / REI Records ───────────────────────────────────────────────────────

// GET /api/compliance/ips
router.get('/ips', async (req, res) => {
  try {
    const { company_id, year, month } = req.query;
    let sql = `
      SELECT ir.*,
             c.legal_name AS company_name,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.ips_number
      FROM ips_rei_records ir
      LEFT JOIN companies c ON c.id = ir.company_id
      LEFT JOIN employees e ON e.id = ir.employee_id
      WHERE 1=1
    `;
    const replacements = [];
    if (company_id) { sql += ' AND ir.company_id = ?';  replacements.push(company_id); }
    if (year)       { sql += ' AND ir.period_year = ?';  replacements.push(year); }
    if (month)      { sql += ' AND ir.period_month = ?'; replacements.push(month); }
    sql += ' ORDER BY ir.period_year DESC, ir.period_month DESC, e.last_name ASC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('GET /api/compliance/ips error:', err);
    res.status(500).json({ error: 'Error al obtener registros IPS' });
  }
});

// POST /api/compliance/ips/calculate/:payrollRunId
router.post('/ips/calculate/:payrollRunId', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query(
      'SELECT * FROM payroll_runs WHERE id = ?',
      { replacements: [req.params.payrollRunId] }
    );
    if (!runs.length) return res.status(404).json({ error: 'Liquidación no encontrada' });
    const run = runs[0];

    // Get settlements with IPS data
    const [settlements] = await sequelize.query(`
      SELECT es.*,
             e.ips_number, e.document_number,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name
      FROM employee_settlements es
      JOIN employees e ON e.id = es.employee_id
      WHERE es.payroll_run_id = ?
    `, { replacements: [run.id] });

    let insertedCount = 0;
    for (const s of settlements) {
      await sequelize.query(`
        INSERT INTO ips_rei_records
          (company_id, employee_id, period_year, period_month, payroll_run_id,
           salary_base, ips_employee_amount, ips_employer_amount, total_contribution,
           status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'calculated', ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          salary_base           = VALUES(salary_base),
          ips_employee_amount   = VALUES(ips_employee_amount),
          ips_employer_amount   = VALUES(ips_employer_amount),
          total_contribution    = VALUES(total_contribution),
          status                = 'calculated',
          updated_at            = NOW()
      `, { replacements: [
        run.company_id, s.employee_id, run.period_year, run.period_month, run.id,
        s.gross_income, s.ips_employee_amount, s.ips_employer_amount,
        parseFloat((parseFloat(s.ips_employee_amount || 0) + parseFloat(s.ips_employer_amount || 0)).toFixed(2)),
        req.user.id
      ]});
      insertedCount++;
    }

    res.json({ message: 'Cálculo IPS completado', records_processed: insertedCount });
  } catch (err) {
    console.error('POST /api/compliance/ips/calculate error:', err);
    res.status(500).json({ error: 'Error al calcular registros IPS' });
  }
});

// GET /api/compliance/ips/export/:year/:month
router.get('/ips/export/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const { company_id } = req.query;

    let sql = `
      SELECT
        e.ips_number,
        e.document_number,
        CONCAT(e.last_name, ', ', e.first_name) AS employee_name,
        ir.salary_base,
        ir.ips_employee_amount,
        ir.ips_employer_amount,
        ir.total_contribution,
        c.patronal_number_ips,
        c.legal_name AS company_name
      FROM ips_rei_records ir
      JOIN employees e ON e.id = ir.employee_id
      JOIN companies c ON c.id = ir.company_id
      WHERE ir.period_year = ? AND ir.period_month = ?
    `;
    const replacements = [year, month];
    if (company_id) { sql += ' AND ir.company_id = ?'; replacements.push(company_id); }
    sql += ' ORDER BY e.last_name ASC, e.first_name ASC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json({ year, month, records: rows });
  } catch (err) {
    console.error('GET /api/compliance/ips/export error:', err);
    res.status(500).json({ error: 'Error al exportar datos IPS' });
  }
});

// ─── Labor Planillas ─────────────────────────────────────────────────────────

// GET /api/compliance/labor-planillas
router.get('/labor-planillas', async (req, res) => {
  try {
    const { company_id, year, status } = req.query;
    let sql = `
      SELECT lp.*, c.legal_name AS company_name
      FROM labor_planillas lp
      LEFT JOIN companies c ON c.id = lp.company_id
      WHERE 1=1
    `;
    const replacements = [];
    if (company_id) { sql += ' AND lp.company_id = ?'; replacements.push(company_id); }
    if (year)       { sql += ' AND lp.year = ?';        replacements.push(year); }
    if (status)     { sql += ' AND lp.status = ?';      replacements.push(status); }
    sql += ' ORDER BY lp.year DESC, lp.created_at DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('GET /api/compliance/labor-planillas error:', err);
    res.status(500).json({ error: 'Error al obtener planillas laborales' });
  }
});

// POST /api/compliance/labor-planillas
router.post('/labor-planillas', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { company_id, year, month, description } = req.body;
    if (!company_id || !year) {
      return res.status(400).json({ error: 'company_id y year son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO labor_planillas
        (company_id, year, month, description, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, NOW(), NOW())
    `, { replacements: [company_id, year, month || null, description || null, req.user.id] });

    const [row] = await sequelize.query('SELECT * FROM labor_planillas WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/compliance/labor-planillas error:', err);
    res.status(500).json({ error: 'Error al crear planilla laboral' });
  }
});

// PUT /api/compliance/labor-planillas/:id
router.put('/labor-planillas/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { status, submission_date, reference_number, observations } = req.body;

    await sequelize.query(`
      UPDATE labor_planillas SET
        status           = COALESCE(?, status),
        submission_date  = COALESCE(?, submission_date),
        reference_number = COALESCE(?, reference_number),
        observations     = COALESCE(?, observations),
        updated_at       = NOW()
      WHERE id = ?
    `, { replacements: [status || null, submission_date || null, reference_number || null, observations || null, req.params.id] });

    const [row] = await sequelize.query('SELECT * FROM labor_planillas WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Planilla no encontrada' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/compliance/labor-planillas/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar planilla laboral' });
  }
});

// GET /api/compliance/labor-planillas/:id/generate — generate planilla data
router.get('/labor-planillas/:id/generate', async (req, res) => {
  try {
    const [planillas] = await sequelize.query(
      'SELECT * FROM labor_planillas WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!planillas.length) return res.status(404).json({ error: 'Planilla no encontrada' });
    const planilla = planillas[0];

    const [employees] = await sequelize.query(`
      SELECT
        e.id, e.document_number, e.first_name, e.last_name,
        e.hire_date, e.termination_date, e.ips_number,
        p.name AS position_name,
        d.name AS department_name,
        pp.base_salary,
        TIMESTAMPDIFF(YEAR, e.hire_date, CURDATE()) AS years_service
      FROM employees e
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status = 'active'
      WHERE e.company_id = ? AND e.status = 'active'
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [planilla.company_id] });

    res.json({
      planilla,
      employee_count: employees.length,
      employees
    });
  } catch (err) {
    console.error('GET /api/compliance/labor-planillas/:id/generate error:', err);
    res.status(500).json({ error: 'Error al generar datos de planilla' });
  }
});

// ─── Social Security Rates ───────────────────────────────────────────────────

// GET /api/compliance/social-security-rates
router.get('/social-security-rates', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT * FROM social_security_rates WHERE status != 'deleted' ORDER BY effective_from DESC"
    );
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('GET /api/compliance/social-security-rates error:', err);
    res.status(500).json({ error: 'Error al obtener tasas de seguridad social' });
  }
});

// PUT /api/compliance/social-security-rates/:id
router.put('/social-security-rates/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const {
      ips_employee_rate, ips_employer_rate,
      effective_from, effective_to, notes, status
    } = req.body;

    await sequelize.query(`
      UPDATE social_security_rates SET
        ips_employee_rate = COALESCE(?, ips_employee_rate),
        ips_employer_rate = COALESCE(?, ips_employer_rate),
        effective_from    = COALESCE(?, effective_from),
        effective_to      = COALESCE(?, effective_to),
        notes             = COALESCE(?, notes),
        status            = COALESCE(?, status),
        updated_at        = NOW()
      WHERE id = ?
    `, { replacements: [
      ips_employee_rate ?? null, ips_employer_rate ?? null,
      effective_from || null, effective_to || null,
      notes || null, status || null, req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM social_security_rates WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Tasa no encontrada' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/compliance/social-security-rates/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar tasa de seguridad social' });
  }
});

// ─── Compliance Status & Calendar ────────────────────────────────────────────

// GET /api/compliance/status — compliance status for company
router.get('/status', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id es requerido' });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Count pending MTESS communications
    const [mtessPending] = await sequelize.query(`
      SELECT COUNT(*) AS count FROM mtess_communications
      WHERE company_id = ? AND status = 'pending'
    `, { replacements: [company_id] });

    // Count current month IPS records
    const [ipsRecords] = await sequelize.query(`
      SELECT COUNT(*) AS count FROM ips_rei_records
      WHERE company_id = ? AND period_year = ? AND period_month = ?
    `, { replacements: [company_id, year, month] });

    // Current month payroll run
    const [payrollRuns] = await sequelize.query(`
      SELECT status, COUNT(*) AS count FROM payroll_runs
      WHERE company_id = ? AND period_year = ? AND period_month = ?
      GROUP BY status
    `, { replacements: [company_id, year, month] });

    // Overdue MTESS (older than 30 days pending)
    const [overdue] = await sequelize.query(`
      SELECT COUNT(*) AS count FROM mtess_communications
      WHERE company_id = ? AND status = 'pending'
        AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, { replacements: [company_id] });

    res.json({
      company_id: parseInt(company_id),
      current_period: { year, month },
      mtess_pending: mtessPending[0]?.count || 0,
      mtess_overdue: overdue[0]?.count || 0,
      ips_current_month: ipsRecords[0]?.count || 0,
      payroll_runs_current_month: payrollRuns
    });
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json({ current_period: {}, mtess_pending: 0, mtess_overdue: 0, ips_current_month: 0, payroll_runs_current_month: [] });
    console.error('GET /api/compliance/status error:', err);
    res.status(500).json({ error: 'Error al obtener estado de cumplimiento' });
  }
});

// GET /api/compliance/calendar — upcoming compliance deadlines
router.get('/calendar', async (req, res) => {
  try {
    const { company_id } = req.query;

    // Get patronal number suffix to determine MTESS deadline day
    let patronalSuffix = null;
    if (company_id) {
      const [companies] = await sequelize.query(
        'SELECT patronal_number_mtess FROM companies WHERE id = ?',
        { replacements: [company_id] }
      );
      if (companies.length && companies[0].patronal_number_mtess) {
        const num = String(companies[0].patronal_number_mtess);
        patronalSuffix = parseInt(num.slice(-1), 10);
      }
    }

    // MTESS rules: liquidación del mes anterior se comunica 2 meses después
    // Vence en día hábil según terminación de número patronal:
    // 0-1: día 5, 2-3: día 7, 4-5: día 9, 6-7: día 11, 8-9: día 13
    const getDeadlineDay = (suffix) => {
      if (suffix === null) return 10; // default midpoint
      if (suffix <= 1) return 5;
      if (suffix <= 3) return 7;
      if (suffix <= 5) return 9;
      if (suffix <= 7) return 11;
      return 13;
    };

    const deadlineDay = getDeadlineDay(patronalSuffix);
    const deadlines = [];
    const now = new Date();

    for (let i = 0; i < 3; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      // MTESS liquidación: refers to 2 months prior
      const refMonth = month <= 2 ? month + 10 : month - 2;
      const refYear  = month <= 2 ? year - 1  : year;

      // Advance deadline day if it falls on weekend
      let deadline = new Date(year, month - 1, deadlineDay);
      const dow = deadline.getDay();
      if (dow === 0) deadline.setDate(deadline.getDate() + 1); // Sunday → Monday
      if (dow === 6) deadline.setDate(deadline.getDate() + 2); // Saturday → Monday

      deadlines.push({
        type: 'MTESS_LIQUIDACION',
        description: `Comunicación MTESS — Liquidación ${String(refMonth).padStart(2, '0')}/${refYear}`,
        reference_period: { year: refYear, month: refMonth },
        deadline: deadline.toISOString().slice(0, 10),
        day_of_month: deadlineDay,
        patronal_suffix_used: patronalSuffix
      });

      // IPS payment deadline: 7th business day of following month
      let ipsDeadline = new Date(year, month - 1, 10); // approximate 7 business days
      const ipsDow = ipsDeadline.getDay();
      if (ipsDow === 0) ipsDeadline.setDate(ipsDeadline.getDate() + 1);
      if (ipsDow === 6) ipsDeadline.setDate(ipsDeadline.getDate() + 2);

      deadlines.push({
        type: 'IPS_PAGO',
        description: `Pago IPS — período ${String(month <= 1 ? 12 : month - 1).padStart(2, '0')}/${month <= 1 ? year - 1 : year}`,
        reference_period: {
          year: month <= 1 ? year - 1 : year,
          month: month <= 1 ? 12 : month - 1
        },
        deadline: ipsDeadline.toISOString().slice(0, 10),
        day_of_month: 10
      });
    }

    // Sort by deadline date
    deadlines.sort((a, b) => a.deadline.localeCompare(b.deadline));

    res.json({ deadlines, patronal_suffix: patronalSuffix, deadline_day: deadlineDay });
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json({ deadlines: [], patronal_suffix: null, deadline_day: 10 });
    console.error('GET /api/compliance/calendar error:', err);
    res.status(500).json({ error: 'Error al obtener calendario de compliance' });
  }
});

module.exports = router;
