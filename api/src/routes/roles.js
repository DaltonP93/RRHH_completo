'use strict';
/**
 * roles.js — CRUD for roles and permissions catalog.
 *
 * GET    /api/roles                   list all roles
 * POST   /api/roles                   create role
 * PUT    /api/roles/:id               update role
 * DELETE /api/roles/:id               delete non-system role
 * GET    /api/roles/:id/permissions   get role permissions
 * PUT    /api/roles/:id/permissions   set role permissions (array of permission_id)
 * GET    /api/permissions             list all permissions_catalog
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { clearPermCache } = require('../middleware/permissions');
const { sequelize } = require('../config/database');

const ADMIN_ROLES = ['super_admin', 'admin'];

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

// ─── GET /api/roles ──────────────────────────────────────────────
router.get('/roles', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT r.id, r.code, r.name, r.description, r.is_system, r.company_id, r.created_at,
             COUNT(DISTINCT ur.user_id) AS user_count
      FROM roles r
      LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/roles ─────────────────────────────────────────────
router.post('/roles', async (req, res) => {
  try {
    const { code, name, description, company_id } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'code y name son requeridos' });
    }
    const safeCode = String(code).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const [result] = await sequelize.query(
      `INSERT INTO roles (code, name, description, is_system, company_id, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, NOW(), NOW())`,
      { replacements: [safeCode, String(name).trim(), description || null, company_id || null] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM roles WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes('Duplicate')) {
      return res.status(409).json({ error: 'Ya existe un rol con ese código' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/roles/:id ──────────────────────────────────────────
router.put('/roles/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const [[existing]] = await sequelize.query(
      'SELECT id, is_system FROM roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Rol no encontrado' });

    await sequelize.query(
      `UPDATE roles SET
         name        = COALESCE(?, name),
         description = COALESCE(?, description),
         updated_at  = NOW()
       WHERE id = ?`,
      { replacements: [name || null, description || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    // Invalidate all permission caches (role change affects all assigned users)
    clearPermCache();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/roles/:id ───────────────────────────────────────
router.delete('/roles/:id', async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id, is_system, code FROM roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Rol no encontrado' });
    if (existing.is_system) {
      return res.status(409).json({ error: 'No se puede eliminar un rol del sistema' });
    }
    // Remove role assignments first
    await sequelize.query('DELETE FROM user_roles WHERE role_id = ?', { replacements: [req.params.id] });
    await sequelize.query('DELETE FROM role_permissions WHERE role_id = ?', { replacements: [req.params.id] });
    await sequelize.query('DELETE FROM roles WHERE id = ?', { replacements: [req.params.id] });
    clearPermCache();
    res.json({ message: `Rol '${existing.code}' eliminado` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/roles/:id/permissions ─────────────────────────────
router.get('/roles/:id/permissions', async (req, res) => {
  try {
    const [[role]] = await sequelize.query(
      'SELECT id, code, name FROM roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });

    const [perms] = await sequelize.query(`
      SELECT pc.id, pc.code, pc.name, pc.module, pc.action,
             COALESCE(rp.allowed, 0) AS allowed
      FROM permissions_catalog pc
      LEFT JOIN role_permissions rp ON rp.permission_id = pc.id AND rp.role_id = ?
      WHERE pc.is_active = 1
      ORDER BY pc.module ASC, pc.action ASC
    `, { replacements: [req.params.id] });

    res.json({ role, permissions: perms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/roles/:id/permissions ─────────────────────────────
// Body: { permission_ids: [1, 2, 3] } — sets allowed=1 for listed, 0 for rest
router.put('/roles/:id/permissions', async (req, res) => {
  try {
    const [[role]] = await sequelize.query(
      'SELECT id, is_system FROM roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });

    const { permission_ids } = req.body;
    if (!Array.isArray(permission_ids)) {
      return res.status(400).json({ error: 'permission_ids debe ser un array' });
    }

    // Get all active permissions
    const [allPerms] = await sequelize.query(
      'SELECT id FROM permissions_catalog WHERE is_active = 1'
    );

    // Upsert: allowed=1 for selected, allowed=0 for others
    for (const perm of allPerms) {
      const allowed = permission_ids.includes(perm.id) ? 1 : 0;
      await sequelize.query(
        `INSERT INTO role_permissions (role_id, permission_id, allowed, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_at = NOW()`,
        { replacements: [req.params.id, perm.id, allowed] }
      );
    }

    clearPermCache();
    res.json({ message: 'Permisos actualizados', role_id: req.params.id, granted: permission_ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/permissions ────────────────────────────────────────
router.get('/permissions', async (req, res) => {
  try {
    const { module } = req.query;
    let where = 'WHERE is_active = 1';
    const params = [];
    if (module) { where += ' AND module = ?'; params.push(module); }

    const [rows] = await sequelize.query(
      `SELECT id, code, name, module, action, description, created_at
       FROM permissions_catalog ${where}
       ORDER BY module ASC, action ASC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
