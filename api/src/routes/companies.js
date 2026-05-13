/**
 * companies.js — CRUD for companies and branches.
 *
 * Routes:
 *   GET    /api/companies
 *   POST   /api/companies
 *   GET    /api/companies/:id
 *   PUT    /api/companies/:id
 *   DELETE /api/companies/:id
 *   GET    /api/companies/:id/branches
 *   POST   /api/companies/:id/branches
 *   PUT    /api/branches/:id
 *   DELETE /api/branches/:id
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Companies ──────────────────────────────────────────────────────────────

// GET /api/companies — list all companies with branch count
router.get('/', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT c.*,
             COUNT(b.id) AS branch_count
      FROM companies c
      LEFT JOIN branches b ON b.company_id = c.id AND b.status = 'active'
      WHERE c.status != 'deleted'
      GROUP BY c.id
      ORDER BY c.legal_name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/companies error:', err);
    res.status(500).json({ error: 'Error al obtener empresas' });
  }
});

// POST /api/companies — create company
router.post('/', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const {
      legal_name, trade_name, ruc, patronal_number_mtess,
      patronal_number_ips, address, phone, email
    } = req.body;

    if (!legal_name) {
      return res.status(400).json({ error: 'legal_name es requerido' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO companies
        (legal_name, trade_name, ruc, patronal_number_mtess, patronal_number_ips,
         address, phone, email, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [
      legal_name, trade_name || null, ruc || null,
      patronal_number_mtess || null, patronal_number_ips || null,
      address || null, phone || null, email || null
    ]});

    const [newCompany] = await sequelize.query(
      'SELECT * FROM companies WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(newCompany[0]);
  } catch (err) {
    console.error('POST /api/companies error:', err);
    res.status(500).json({ error: 'Error al crear empresa' });
  }
});

// GET /api/companies/:id — get company with branches
router.get('/:id', async (req, res) => {
  try {
    const [companies] = await sequelize.query(
      'SELECT * FROM companies WHERE id = ? AND status != ?',
      { replacements: [req.params.id, 'deleted'] }
    );
    if (!companies.length) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    const [branches] = await sequelize.query(
      "SELECT * FROM branches WHERE company_id = ? AND status != 'deleted' ORDER BY name ASC",
      { replacements: [req.params.id] }
    );
    res.json({ ...companies[0], branches });
  } catch (err) {
    console.error('GET /api/companies/:id error:', err);
    res.status(500).json({ error: 'Error al obtener empresa' });
  }
});

// PUT /api/companies/:id — update company
router.put('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const {
      legal_name, trade_name, ruc, patronal_number_mtess,
      patronal_number_ips, address, phone, email, status
    } = req.body;

    await sequelize.query(`
      UPDATE companies SET
        legal_name = COALESCE(?, legal_name),
        trade_name = COALESCE(?, trade_name),
        ruc = COALESCE(?, ruc),
        patronal_number_mtess = COALESCE(?, patronal_number_mtess),
        patronal_number_ips = COALESCE(?, patronal_number_ips),
        address = COALESCE(?, address),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        status = COALESCE(?, status),
        updated_at = NOW()
      WHERE id = ?
    `, { replacements: [
      legal_name || null, trade_name || null, ruc || null,
      patronal_number_mtess || null, patronal_number_ips || null,
      address || null, phone || null, email || null,
      status || null, req.params.id
    ]});

    const [updated] = await sequelize.query(
      'SELECT * FROM companies WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated.length) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(updated[0]);
  } catch (err) {
    console.error('PUT /api/companies/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar empresa' });
  }
});

// DELETE /api/companies/:id — soft delete
router.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    await sequelize.query(
      "UPDATE companies SET status = 'inactive', updated_at = NOW() WHERE id = ?",
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Empresa desactivada correctamente' });
  } catch (err) {
    console.error('DELETE /api/companies/:id error:', err);
    res.status(500).json({ error: 'Error al desactivar empresa' });
  }
});

// ─── Branches under company ──────────────────────────────────────────────────

// GET /api/companies/:id/branches
router.get('/:id/branches', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT * FROM branches WHERE company_id = ? AND status != 'deleted' ORDER BY name ASC",
      { replacements: [req.params.id] }
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/companies/:id/branches error:', err);
    res.status(500).json({ error: 'Error al obtener sucursales' });
  }
});

// POST /api/companies/:id/branches — create branch
router.post('/:id/branches', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, address, phone, email, manager_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO branches (company_id, name, code, address, phone, email, manager_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [
      req.params.id, name, code || null, address || null,
      phone || null, email || null, manager_id || null
    ]});

    const [newBranch] = await sequelize.query(
      'SELECT * FROM branches WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(newBranch[0]);
  } catch (err) {
    console.error('POST /api/companies/:id/branches error:', err);
    res.status(500).json({ error: 'Error al crear sucursal' });
  }
});

// ─── Branches standalone ─────────────────────────────────────────────────────

// PUT /api/branches/:id — update branch
router.put('/branches/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, address, phone, email, manager_id, status } = req.body;

    await sequelize.query(`
      UPDATE branches SET
        name       = COALESCE(?, name),
        code       = COALESCE(?, code),
        address    = COALESCE(?, address),
        phone      = COALESCE(?, phone),
        email      = COALESCE(?, email),
        manager_id = COALESCE(?, manager_id),
        status     = COALESCE(?, status),
        updated_at = NOW()
      WHERE id = ?
    `, { replacements: [
      name || null, code || null, address || null,
      phone || null, email || null, manager_id || null,
      status || null, req.params.id
    ]});

    const [updated] = await sequelize.query(
      'SELECT * FROM branches WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated.length) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.json(updated[0]);
  } catch (err) {
    console.error('PUT /api/branches/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar sucursal' });
  }
});

// DELETE /api/branches/:id — soft delete branch
router.delete('/branches/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    await sequelize.query(
      "UPDATE branches SET status = 'inactive', updated_at = NOW() WHERE id = ?",
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Sucursal desactivada correctamente' });
  } catch (err) {
    console.error('DELETE /api/branches/:id error:', err);
    res.status(500).json({ error: 'Error al desactivar sucursal' });
  }
});

module.exports = router;
