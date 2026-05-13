/**
 * salaryAdvances.js — Salary advances (anticipos) management.
 *
 * Routes:
 *   GET/POST              /api/salary-advances
 *   GET                   /api/salary-advances/:id
 *   POST                  /api/salary-advances/:id/approve
 *   POST                  /api/salary-advances/:id/reject
 *   GET/POST              /api/salary-advance-types
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Salary Advance Types ────────────────────────────────────────────────────

// GET /api/salary-advance-types
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

// POST /api/salary-advance-types
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
      requires_approval ? 1 : 1  // default: requires approval
    ]});

    const [row] = await sequelize.query('SELECT * FROM salary_advance_types WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/salary-advance-types error:', err);
    res.status(500).json({ error: 'Error al crear tipo de anticipo' });
  }
});

// ─── Salary Advances ─────────────────────────────────────────────────────────

// GET /api/salary-advances — list with filters
router.get('/', async (req, res) => {
  try {
    const { employee_id, status, year, company_id } = req.query;
    let sql = `
      SELECT sa.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.code AS employee_code,
             sat.name AS advance_type_name,
             CONCAT(u.first_name, ' ', u.last_name) AS approved_by_name
      FROM salary_advances sa
      JOIN employees e ON e.id = sa.employee_id
      LEFT JOIN salary_advance_types sat ON sat.id = sa.advance_type_id
      LEFT JOIN users u ON u.id = sa.approved_by
      WHERE 1=1
    `;
    const replacements = [];
    if (employee_id) { sql += ' AND sa.employee_id = ?';        replacements.push(employee_id); }
    if (status)      { sql += ' AND sa.status = ?';             replacements.push(status); }
    if (year)        { sql += ' AND YEAR(sa.request_date) = ?'; replacements.push(year); }
    if (company_id)  { sql += ' AND e.company_id = ?';          replacements.push(company_id); }
    sql += ' ORDER BY sa.request_date DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/salary-advances error:', err);
    res.status(500).json({ error: 'Error al obtener anticipos' });
  }
});

// POST /api/salary-advances — create advance request
router.post('/', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      employee_id, advance_type_id, amount, request_date,
      payment_date, reason, notes, deduct_from_payroll_run_id
    } = req.body;

    if (!employee_id || !amount || !request_date) {
      return res.status(400).json({ error: 'employee_id, amount y request_date son requeridos' });
    }

    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO salary_advances
        (employee_id, advance_type_id, amount, request_date, payment_date,
         reason, notes, deduct_from_payroll_run_id, status, requested_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())
    `, { replacements: [
      employee_id, advance_type_id || null, amount, request_date,
      payment_date || null, reason || null, notes || null,
      deduct_from_payroll_run_id || null, req.user.id
    ]});

    const [row] = await sequelize.query(`
      SELECT sa.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name
      FROM salary_advances sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE sa.id = ?
    `, { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/salary-advances error:', err);
    res.status(500).json({ error: 'Error al crear anticipo' });
  }
});

// GET /api/salary-advances/:id — get detail
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT sa.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.code AS employee_code,
             sat.name AS advance_type_name,
             CONCAT(ua.first_name, ' ', ua.last_name) AS approved_by_name,
             CONCAT(ur.first_name, ' ', ur.last_name) AS requested_by_name
      FROM salary_advances sa
      JOIN employees e ON e.id = sa.employee_id
      LEFT JOIN salary_advance_types sat ON sat.id = sa.advance_type_id
      LEFT JOIN users ua ON ua.id = sa.approved_by
      LEFT JOIN users ur ON ur.id = sa.requested_by
      WHERE sa.id = ?
    `, { replacements: [req.params.id] });

    if (!rows.length) return res.status(404).json({ error: 'Anticipo no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/salary-advances/:id error:', err);
    res.status(500).json({ error: 'Error al obtener anticipo' });
  }
});

// POST /api/salary-advances/:id/approve
router.post('/:id/approve', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [advances] = await sequelize.query(
      'SELECT * FROM salary_advances WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!advances.length) return res.status(404).json({ error: 'Anticipo no encontrado' });
    if (advances[0].status !== 'pending') {
      return res.status(400).json({ error: 'Solo se pueden aprobar anticipos pendientes' });
    }

    const { payment_date, notes } = req.body;

    await sequelize.query(`
      UPDATE salary_advances
      SET status = 'approved',
          approved_by = ?,
          approved_at = NOW(),
          payment_date = COALESCE(?, payment_date),
          notes = COALESCE(?, notes),
          updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, payment_date || null, notes || null, req.params.id] });

    const [updated] = await sequelize.query(
      'SELECT * FROM salary_advances WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('POST /api/salary-advances/:id/approve error:', err);
    res.status(500).json({ error: 'Error al aprobar anticipo' });
  }
});

// POST /api/salary-advances/:id/reject
router.post('/:id/reject', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [advances] = await sequelize.query(
      'SELECT * FROM salary_advances WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!advances.length) return res.status(404).json({ error: 'Anticipo no encontrado' });
    if (!['pending', 'approved'].includes(advances[0].status)) {
      return res.status(400).json({ error: 'No se puede rechazar un anticipo en este estado' });
    }

    const { rejection_reason } = req.body;

    await sequelize.query(`
      UPDATE salary_advances
      SET status = 'rejected',
          approved_by = ?,
          approved_at = NOW(),
          rejection_reason = ?,
          updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, rejection_reason || null, req.params.id] });

    const [updated] = await sequelize.query(
      'SELECT * FROM salary_advances WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('POST /api/salary-advances/:id/reject error:', err);
    res.status(500).json({ error: 'Error al rechazar anticipo' });
  }
});

module.exports = router;
