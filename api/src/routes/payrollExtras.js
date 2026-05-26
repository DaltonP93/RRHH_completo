/**
 * payrollExtras.js — Rutas de soporte de nómina sin wildcard /:id.
 *
 * Extraídas de payrollRuns.js para evitar que el /:id de payroll-runs
 * capture requests a /api/settlement-types y /api/payroll-monthly-parameters.
 *
 *   GET/POST              /api/settlement-types
 *   GET/POST/PUT          /api/payroll-monthly-parameters
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Settlement Types ────────────────────────────────────────────────────────

router.get('/settlement-types', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT * FROM settlement_types WHERE status != 'deleted' ORDER BY name ASC"
    );
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('GET /api/settlement-types error:', err);
    res.status(500).json({ error: 'Error al obtener tipos de liquidación' });
  }
});

router.post('/settlement-types', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO settlement_types (name, code, description, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [name, code || null, description || null] });

    const [row] = await sequelize.query('SELECT * FROM settlement_types WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/settlement-types error:', err);
    res.status(500).json({ error: 'Error al crear tipo de liquidación' });
  }
});

// ─── Payroll Monthly Parameters ─────────────────────────────────────────────

router.get('/payroll-monthly-parameters', async (req, res) => {
  try {
    const { year } = req.query;
    let sql = 'SELECT * FROM payroll_monthly_parameters WHERE 1=1';
    const replacements = [];
    if (year) { sql += ' AND year = ?'; replacements.push(year); }
    sql += ' ORDER BY year DESC, month DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('GET /api/payroll-monthly-parameters error:', err);
    res.status(500).json({ error: 'Error al obtener parámetros mensuales' });
  }
});

router.post('/payroll-monthly-parameters', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { year, month, working_days, ips_rate_employee, ips_rate_employer, minimum_wage, notes } = req.body;
    if (!year || !month) return res.status(400).json({ error: 'year y month son requeridos' });

    const [result] = await sequelize.query(`
      INSERT INTO payroll_monthly_parameters
        (year, month, working_days, ips_rate_employee, ips_rate_employer,
         minimum_wage, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, { replacements: [
      year, month, working_days || 26,
      ips_rate_employee || 0.09, ips_rate_employer || 0.165,
      minimum_wage || null, notes || null, req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM payroll_monthly_parameters WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/payroll-monthly-parameters error:', err);
    res.status(500).json({ error: 'Error al crear parámetros mensuales' });
  }
});

router.put('/payroll-monthly-parameters/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { working_days, ips_rate_employee, ips_rate_employer, minimum_wage, notes } = req.body;

    await sequelize.query(`
      UPDATE payroll_monthly_parameters SET
        working_days        = COALESCE(?, working_days),
        ips_rate_employee   = COALESCE(?, ips_rate_employee),
        ips_rate_employer   = COALESCE(?, ips_rate_employer),
        minimum_wage        = COALESCE(?, minimum_wage),
        notes               = COALESCE(?, notes),
        updated_at          = NOW()
      WHERE id = ?
    `, { replacements: [
      working_days ?? null, ips_rate_employee ?? null, ips_rate_employer ?? null,
      minimum_wage ?? null, notes || null, req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM payroll_monthly_parameters WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Parámetros no encontrados' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/payroll-monthly-parameters/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar parámetros mensuales' });
  }
});

// ─── Salary Advance Types ────────────────────────────────────────────────────

router.get('/salary-advance-types', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT * FROM salary_advance_types WHERE status != 'deleted' ORDER BY name ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/salary-advance-types error:', err);
    res.status(500).json({ error: 'Error al obtener tipos de anticipo' });
  }
});

router.post('/salary-advance-types', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, description, max_percentage, max_amount, requires_approval } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO salary_advance_types
        (name, code, description, max_percentage, max_amount, requires_approval, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [
      name, code || null, description || null,
      max_percentage || null, max_amount || null,
      requires_approval ? 1 : 1
    ]});

    const [row] = await sequelize.query('SELECT * FROM salary_advance_types WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/salary-advance-types error:', err);
    res.status(500).json({ error: 'Error al crear tipo de anticipo' });
  }
});

module.exports = router;
