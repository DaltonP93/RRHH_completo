/**
 * payrollCore.js — Payroll profiles, salary concepts, fixed concepts, salary history.
 *
 * Routes:
 *   GET/POST       /api/payroll/profiles
 *   GET/PUT        /api/payroll/profiles/:id
 *   GET/:employeeId /api/payroll/profiles/:employeeId
 *   GET/POST       /api/salary-history
 *   GET/:employeeId /api/salary-history/:employeeId
 *   GET/POST       /api/salary-concepts
 *   PUT/DELETE     /api/salary-concepts/:id
 *   GET/POST       /api/salary-concept-groups
 *   GET/POST       /api/employee-fixed-concepts
 *   GET            /api/employee-fixed-concepts/:employeeId
 *   PUT/DELETE     /api/employee-fixed-concepts/:id
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Payroll Profiles ────────────────────────────────────────────────────────

// GET /api/payroll/profiles
router.get('/profiles', async (req, res) => {
  try {
    const { company_id, status } = req.query;
    let sql = `
      SELECT pp.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.code AS employee_code,
             b.name AS bank_name
      FROM payroll_profiles pp
      JOIN employees e ON e.id = pp.employee_id
      LEFT JOIN banks b ON b.id = pp.bank_id
      WHERE 1=1
    `;
    const replacements = [];
    if (company_id) { sql += ' AND e.company_id = ?'; replacements.push(company_id); }
    if (status)     { sql += ' AND pp.status = ?';    replacements.push(status); }
    sql += ' ORDER BY e.last_name ASC, e.first_name ASC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/payroll/profiles error:', err);
    res.status(500).json({ error: 'Error al obtener perfiles de nómina' });
  }
});

// GET /api/payroll/profiles/:employeeId
router.get('/profiles/:employeeId', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT pp.*, b.name AS bank_name
      FROM payroll_profiles pp
      LEFT JOIN banks b ON b.id = pp.bank_id
      WHERE pp.employee_id = ? AND pp.status = 'active'
      ORDER BY pp.valid_from DESC
      LIMIT 1
    `, { replacements: [req.params.employeeId] });

    if (!rows.length) return res.status(404).json({ error: 'Perfil de nómina no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/payroll/profiles/:employeeId error:', err);
    res.status(500).json({ error: 'Error al obtener perfil de nómina' });
  }
});

// POST /api/payroll/profiles — upsert by employee_id + valid_from
router.post('/profiles', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      employee_id, base_salary, payment_method, bank_id,
      bank_account_number, bank_account_type, valid_from, valid_to,
      currency, working_hours_per_day, working_days_per_month
    } = req.body;

    if (!employee_id || !base_salary || !valid_from) {
      return res.status(400).json({ error: 'employee_id, base_salary y valid_from son requeridos' });
    }

    // Close previous active profile if exists
    await sequelize.query(`
      UPDATE payroll_profiles
      SET status = 'inactive', valid_to = DATE_SUB(?, INTERVAL 1 DAY), updated_at = NOW()
      WHERE employee_id = ? AND status = 'active' AND (valid_to IS NULL OR valid_to >= ?)
    `, { replacements: [valid_from, employee_id, valid_from] });

    const [result] = await sequelize.query(`
      INSERT INTO payroll_profiles
        (employee_id, base_salary, payment_method, bank_id, bank_account_number,
         bank_account_type, valid_from, valid_to, currency,
         working_hours_per_day, working_days_per_month, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        base_salary = VALUES(base_salary),
        payment_method = VALUES(payment_method),
        bank_id = VALUES(bank_id),
        bank_account_number = VALUES(bank_account_number),
        bank_account_type = VALUES(bank_account_type),
        valid_to = VALUES(valid_to),
        currency = VALUES(currency),
        working_hours_per_day = VALUES(working_hours_per_day),
        working_days_per_month = VALUES(working_days_per_month),
        updated_at = NOW()
    `, { replacements: [
      employee_id, base_salary, payment_method || 'BANCO',
      bank_id || null, bank_account_number || null, bank_account_type || null,
      valid_from, valid_to || null, currency || 'PYG',
      working_hours_per_day || 8, working_days_per_month || 30
    ]});

    const insertId = typeof result === 'number' ? result : result.insertId;
    const [row] = await sequelize.query('SELECT * FROM payroll_profiles WHERE id = ?', { replacements: [insertId] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/payroll/profiles error:', err);
    res.status(500).json({ error: 'Error al crear/actualizar perfil de nómina' });
  }
});

// PUT /api/payroll/profiles/:id
router.put('/profiles/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      base_salary, payment_method, bank_id, bank_account_number,
      bank_account_type, valid_from, valid_to, currency,
      working_hours_per_day, working_days_per_month, status
    } = req.body;

    await sequelize.query(`
      UPDATE payroll_profiles SET
        base_salary            = COALESCE(?, base_salary),
        payment_method         = COALESCE(?, payment_method),
        bank_id                = COALESCE(?, bank_id),
        bank_account_number    = COALESCE(?, bank_account_number),
        bank_account_type      = COALESCE(?, bank_account_type),
        valid_from             = COALESCE(?, valid_from),
        valid_to               = COALESCE(?, valid_to),
        currency               = COALESCE(?, currency),
        working_hours_per_day  = COALESCE(?, working_hours_per_day),
        working_days_per_month = COALESCE(?, working_days_per_month),
        status                 = COALESCE(?, status),
        updated_at             = NOW()
      WHERE id = ?
    `, { replacements: [
      base_salary || null, payment_method || null, bank_id || null,
      bank_account_number || null, bank_account_type || null,
      valid_from || null, valid_to || null, currency || null,
      working_hours_per_day || null, working_days_per_month || null,
      status || null, req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM payroll_profiles WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Perfil no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/payroll/profiles/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar perfil de nómina' });
  }
});

// ─── Salary History ──────────────────────────────────────────────────────────

// GET /api/salary-history/:employeeId
router.get('/salary-history/:employeeId', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT sh.*,
             CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
      FROM salary_history sh
      LEFT JOIN users u ON u.id = sh.created_by
      WHERE sh.employee_id = ?
      ORDER BY sh.effective_date DESC
    `, { replacements: [req.params.employeeId] });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/salary-history/:employeeId error:', err);
    res.status(500).json({ error: 'Error al obtener historial salarial' });
  }
});

// POST /api/salary-history
router.post('/salary-history', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      employee_id, previous_salary, new_salary, effective_date,
      reason, notes, adjustment_type
    } = req.body;

    if (!employee_id || !new_salary || !effective_date) {
      return res.status(400).json({ error: 'employee_id, new_salary y effective_date son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO salary_history
        (employee_id, previous_salary, new_salary, effective_date, reason, notes,
         adjustment_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, { replacements: [
      employee_id, previous_salary || null, new_salary, effective_date,
      reason || null, notes || null, adjustment_type || 'adjustment',
      req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM salary_history WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/salary-history error:', err);
    res.status(500).json({ error: 'Error al crear historial salarial' });
  }
});

// ─── Salary Concept Groups ───────────────────────────────────────────────────

// GET /api/salary-concept-groups
router.get('/salary-concept-groups', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT scg.*, COUNT(sc.id) AS concept_count
      FROM salary_concept_groups scg
      LEFT JOIN salary_concepts sc ON sc.group_id = scg.id AND sc.status = 'active'
      WHERE scg.status != 'deleted'
      GROUP BY scg.id
      ORDER BY scg.sort_order ASC, scg.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/salary-concept-groups error:', err);
    res.status(500).json({ error: 'Error al obtener grupos de conceptos' });
  }
});

// POST /api/salary-concept-groups
router.post('/salary-concept-groups', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, type, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO salary_concept_groups (name, code, type, description, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [name, code || null, type || 'earning', description || null, sort_order || 0] });

    const [row] = await sequelize.query('SELECT * FROM salary_concept_groups WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/salary-concept-groups error:', err);
    res.status(500).json({ error: 'Error al crear grupo de conceptos' });
  }
});

// ─── Salary Concepts ─────────────────────────────────────────────────────────

// GET /api/salary-concepts
router.get('/salary-concepts', async (req, res) => {
  try {
    const { company_id, type, group_id } = req.query;
    let sql = `
      SELECT sc.*, scg.name AS group_name, scg.type AS group_type
      FROM salary_concepts sc
      LEFT JOIN salary_concept_groups scg ON scg.id = sc.group_id
      WHERE sc.status != 'deleted'
    `;
    const replacements = [];
    if (company_id) { sql += ' AND (sc.company_id = ? OR sc.company_id IS NULL)'; replacements.push(company_id); }
    if (type)       { sql += ' AND sc.type = ?'; replacements.push(type); }
    if (group_id)   { sql += ' AND sc.group_id = ?'; replacements.push(group_id); }
    sql += ' ORDER BY scg.sort_order ASC, sc.sort_order ASC, sc.name ASC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/salary-concepts error:', err);
    res.status(500).json({ error: 'Error al obtener conceptos salariales' });
  }
});

// POST /api/salary-concepts
router.post('/salary-concepts', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      name, code, group_id, type, company_id, description,
      calculation_type, calculation_value, affects_ips, affects_christmas_bonus,
      affects_vacation_pay, is_taxable, sort_order
    } = req.body;

    if (!name || !type) return res.status(400).json({ error: 'name y type son requeridos' });

    const [result] = await sequelize.query(`
      INSERT INTO salary_concepts
        (name, code, group_id, type, company_id, description, calculation_type,
         calculation_value, affects_ips, affects_christmas_bonus, affects_vacation_pay,
         is_taxable, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [
      name, code || null, group_id || null, type, company_id || null,
      description || null, calculation_type || 'fixed', calculation_value || null,
      affects_ips ? 1 : 0, affects_christmas_bonus ? 1 : 0,
      affects_vacation_pay ? 1 : 0, is_taxable ? 1 : 0, sort_order || 0
    ]});

    const [row] = await sequelize.query('SELECT * FROM salary_concepts WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/salary-concepts error:', err);
    res.status(500).json({ error: 'Error al crear concepto salarial' });
  }
});

// PUT /api/salary-concepts/:id
router.put('/salary-concepts/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      name, code, group_id, type, description, calculation_type,
      calculation_value, affects_ips, affects_christmas_bonus,
      affects_vacation_pay, is_taxable, sort_order, status
    } = req.body;

    await sequelize.query(`
      UPDATE salary_concepts SET
        name                   = COALESCE(?, name),
        code                   = COALESCE(?, code),
        group_id               = COALESCE(?, group_id),
        type                   = COALESCE(?, type),
        description            = COALESCE(?, description),
        calculation_type       = COALESCE(?, calculation_type),
        calculation_value      = COALESCE(?, calculation_value),
        affects_ips            = COALESCE(?, affects_ips),
        affects_christmas_bonus= COALESCE(?, affects_christmas_bonus),
        affects_vacation_pay   = COALESCE(?, affects_vacation_pay),
        is_taxable             = COALESCE(?, is_taxable),
        sort_order             = COALESCE(?, sort_order),
        status                 = COALESCE(?, status),
        updated_at             = NOW()
      WHERE id = ?
    `, { replacements: [
      name || null, code || null, group_id || null, type || null,
      description || null, calculation_type || null, calculation_value || null,
      affects_ips != null ? (affects_ips ? 1 : 0) : null,
      affects_christmas_bonus != null ? (affects_christmas_bonus ? 1 : 0) : null,
      affects_vacation_pay != null ? (affects_vacation_pay ? 1 : 0) : null,
      is_taxable != null ? (is_taxable ? 1 : 0) : null,
      sort_order ?? null, status || null, req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM salary_concepts WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Concepto salarial no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/salary-concepts/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar concepto salarial' });
  }
});

// DELETE /api/salary-concepts/:id
router.delete('/salary-concepts/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    await sequelize.query(
      "UPDATE salary_concepts SET status = 'inactive', updated_at = NOW() WHERE id = ?",
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Concepto salarial desactivado correctamente' });
  } catch (err) {
    console.error('DELETE /api/salary-concepts/:id error:', err);
    res.status(500).json({ error: 'Error al desactivar concepto salarial' });
  }
});

// ─── Employee Fixed Concepts ─────────────────────────────────────────────────

// GET /api/employee-fixed-concepts/:employeeId
router.get('/employee-fixed-concepts/:employeeId', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT efc.*, sc.name AS concept_name, sc.type AS concept_type,
             sc.calculation_type, sc.affects_ips
      FROM employee_fixed_concepts efc
      JOIN salary_concepts sc ON sc.id = efc.salary_concept_id
      WHERE efc.employee_id = ? AND efc.status = 'active'
      ORDER BY sc.type ASC, sc.sort_order ASC
    `, { replacements: [req.params.employeeId] });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/employee-fixed-concepts/:employeeId error:', err);
    res.status(500).json({ error: 'Error al obtener conceptos fijos del empleado' });
  }
});

// POST /api/employee-fixed-concepts
router.post('/employee-fixed-concepts', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      employee_id, salary_concept_id, amount, percentage,
      valid_from, valid_to, notes
    } = req.body;

    if (!employee_id || !salary_concept_id) {
      return res.status(400).json({ error: 'employee_id y salary_concept_id son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO employee_fixed_concepts
        (employee_id, salary_concept_id, amount, percentage, valid_from, valid_to,
         notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())
    `, { replacements: [
      employee_id, salary_concept_id,
      amount || null, percentage || null,
      valid_from || null, valid_to || null,
      notes || null, req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM employee_fixed_concepts WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/employee-fixed-concepts error:', err);
    res.status(500).json({ error: 'Error al agregar concepto fijo' });
  }
});

// PUT /api/employee-fixed-concepts/:id
router.put('/employee-fixed-concepts/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { amount, percentage, valid_from, valid_to, notes, status } = req.body;

    await sequelize.query(`
      UPDATE employee_fixed_concepts SET
        amount     = COALESCE(?, amount),
        percentage = COALESCE(?, percentage),
        valid_from = COALESCE(?, valid_from),
        valid_to   = COALESCE(?, valid_to),
        notes      = COALESCE(?, notes),
        status     = COALESCE(?, status),
        updated_at = NOW()
      WHERE id = ?
    `, { replacements: [
      amount || null, percentage || null,
      valid_from || null, valid_to || null,
      notes || null, status || null, req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM employee_fixed_concepts WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Concepto fijo no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/employee-fixed-concepts/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar concepto fijo' });
  }
});

// DELETE /api/employee-fixed-concepts/:id — deactivate
router.delete('/employee-fixed-concepts/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    await sequelize.query(
      "UPDATE employee_fixed_concepts SET status = 'inactive', updated_at = NOW() WHERE id = ?",
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Concepto fijo desactivado correctamente' });
  } catch (err) {
    console.error('DELETE /api/employee-fixed-concepts/:id error:', err);
    res.status(500).json({ error: 'Error al desactivar concepto fijo' });
  }
});

module.exports = router;
