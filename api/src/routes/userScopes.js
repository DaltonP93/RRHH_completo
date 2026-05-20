'use strict';
/**
 * userScopes.js — RBAC scope management.
 *
 * GET    /api/user-scopes?user_id=X              get user scopes and roles
 * POST   /api/user-scopes/assign-role            assign role to user
 * DELETE /api/user-scopes/remove-role            remove role from user
 * POST   /api/user-scopes/set-scope              upsert user scope
 * GET    /api/user-scopes/:user_id/effective-permissions  effective permissions for user
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getUserPermissions, clearPermCache } = require('../middleware/permissions');
const { sequelize } = require('../config/database');

const ADMIN_ROLES = ['super_admin', 'admin'];

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

// ─── GET /api/user-scopes?user_id=X ─────────────────────────────
router.get('/user-scopes', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });

    const [[user]] = await sequelize.query(
      'SELECT id, username, email, full_name, role FROM users WHERE id = ?',
      { replacements: [user_id] }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const [roles] = await sequelize.query(`
      SELECT r.id AS role_id, r.code, r.name, r.description, r.is_system,
             ur.company_id, ur.branch_id, ur.created_at AS assigned_at
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.name ASC
    `, { replacements: [user_id] });

    const [scopes] = await sequelize.query(`
      SELECT id, scope_type, company_id, branch_id, department_id, employee_id, created_at
      FROM user_scopes
      WHERE user_id = ?
      ORDER BY id ASC
    `, { replacements: [user_id] });

    res.json({ user, roles, scopes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/user-scopes/assign-role ──────────────────────────
router.post('/user-scopes/assign-role', async (req, res) => {
  try {
    const { user_id, role_code, company_id, branch_id } = req.body;
    if (!user_id || !role_code) {
      return res.status(400).json({ error: 'user_id y role_code son requeridos' });
    }

    const [[role]] = await sequelize.query(
      'SELECT id FROM roles WHERE code = ?',
      { replacements: [role_code] }
    );
    if (!role) return res.status(404).json({ error: `Rol '${role_code}' no encontrado` });

    // Check user exists
    const [[user]] = await sequelize.query(
      'SELECT id FROM users WHERE id = ?',
      { replacements: [user_id] }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await sequelize.query(
      `INSERT INTO user_roles (user_id, role_id, company_id, branch_id, created_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE company_id = VALUES(company_id), branch_id = VALUES(branch_id)`,
      { replacements: [user_id, role.id, company_id || null, branch_id || null] }
    );

    clearPermCache(user_id);
    res.status(201).json({ message: 'Rol asignado', user_id, role_code, role_id: role.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/user-scopes/remove-role ────────────────────────
router.delete('/user-scopes/remove-role', async (req, res) => {
  try {
    const { user_id, role_id } = req.body;
    if (!user_id || !role_id) {
      return res.status(400).json({ error: 'user_id y role_id son requeridos' });
    }

    const [[existing]] = await sequelize.query(
      'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
      { replacements: [user_id, role_id] }
    );
    if (!existing) return res.status(404).json({ error: 'Asignación no encontrada' });

    await sequelize.query(
      'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
      { replacements: [user_id, role_id] }
    );

    clearPermCache(user_id);
    res.json({ message: 'Rol removido', user_id, role_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/user-scopes/set-scope ────────────────────────────
router.post('/user-scopes/set-scope', async (req, res) => {
  try {
    const { user_id, scope_type, company_id, branch_id, department_id, employee_id } = req.body;
    if (!user_id || !scope_type) {
      return res.status(400).json({ error: 'user_id y scope_type son requeridos' });
    }

    const VALID_SCOPES = ['global', 'company', 'branch', 'department', 'team', 'own'];
    if (!VALID_SCOPES.includes(scope_type)) {
      return res.status(400).json({ error: `scope_type inválido. Valores posibles: ${VALID_SCOPES.join(', ')}` });
    }

    // Check user exists
    const [[user]] = await sequelize.query(
      'SELECT id FROM users WHERE id = ?',
      { replacements: [user_id] }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Upsert by user_id + scope_type
    await sequelize.query(
      `INSERT INTO user_scopes (user_id, scope_type, company_id, branch_id, department_id, employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         company_id    = VALUES(company_id),
         branch_id     = VALUES(branch_id),
         department_id = VALUES(department_id),
         employee_id   = VALUES(employee_id),
         updated_at    = NOW()`,
      { replacements: [user_id, scope_type, company_id || null, branch_id || null, department_id || null, employee_id || null] }
    );

    clearPermCache(user_id);

    const [scopes] = await sequelize.query(
      'SELECT * FROM user_scopes WHERE user_id = ?',
      { replacements: [user_id] }
    );
    res.json({ message: 'Alcance configurado', user_id, scope_type, scopes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/user-scopes/:user_id/effective-permissions ────────
router.get('/user-scopes/:user_id/effective-permissions', async (req, res) => {
  try {
    const { user_id } = req.params;

    const [[user]] = await sequelize.query(
      'SELECT id, username, role FROM users WHERE id = ?',
      { replacements: [user_id] }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let permissions;
    if (user.role === 'super_admin') {
      // super_admin has all permissions
      const [allPerms] = await sequelize.query(
        'SELECT id, code, name, module, action FROM permissions_catalog WHERE is_active = 1 ORDER BY module, action'
      );
      permissions = allPerms.map(p => ({ ...p, source: 'super_admin_bypass' }));
    } else {
      const [rows] = await sequelize.query(`
        SELECT DISTINCT pc.id, pc.code, pc.name, pc.module, pc.action,
               r.code AS role_code, r.name AS role_name
        FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.allowed = 1
        JOIN permissions_catalog pc ON pc.id = rp.permission_id
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?
        ORDER BY pc.module ASC, pc.action ASC
      `, { replacements: [user_id] });
      permissions = rows;
    }

    const [scopes] = await sequelize.query(
      'SELECT * FROM user_scopes WHERE user_id = ?',
      { replacements: [user_id] }
    );

    res.json({
      user: { id: user.id, username: user.username, role: user.role },
      effective_permissions: permissions,
      scopes,
      permission_codes: permissions.map(p => p.code),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
