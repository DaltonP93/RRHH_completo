'use strict';
/**
 * securityGranular.js — Granular security management.
 *
 * GET    /api/security/modules                          list security modules
 * PUT    /api/security/modules/:code                    enable/disable module
 * GET    /api/security/permissions                      list all permissions
 * GET    /api/security/roles                            list roles with permission count
 * POST   /api/security/roles                            create role
 * GET    /api/security/roles/:id                        get role with permissions
 * PUT    /api/security/roles/:id                        update role
 * DELETE /api/security/roles/:id                        disable role
 * POST   /api/security/roles/:id/permissions            assign permissions to role
 * DELETE /api/security/roles/:roleId/permissions/:permissionId  remove permission
 * GET    /api/security/users/:userId/roles              get roles for user
 * POST   /api/security/users/:userId/roles              assign role to user
 * DELETE /api/security/users/:userId/roles/:roleId      remove role from user
 * GET    /api/security/user-permissions/:userId         effective permissions for user
 * GET    /api/security/field-permissions/:roleId        field permissions for role
 * POST   /api/security/field-permissions               set field permission
 * PUT    /api/security/field-permissions/:id           update field permission
 * POST   /api/security/test-access                     test if user has permission
 * GET    /api/security/audit                           security audit log
 * GET    /api/security/data-scopes/:userId             data scopes for user
 * POST   /api/security/data-scopes                     assign data scope
 * DELETE /api/security/data-scopes/:id                 remove data scope
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

const ADMIN_ROLES = ['admin', 'super_admin'];

// ─── checkPermission middleware factory ──────────────────────────────────────
// Exported for use in other routes.
const checkPermission = (permissionCode) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  // Super admin bypass
  if (req.user.role === 'admin' || req.user.role === 'super_admin') return next();
  try {
    const [rows] = await sequelize.query(
      `SELECT srp.allow_effect FROM security_user_roles sur
         JOIN security_role_permissions srp ON srp.role_id = sur.role_id
         JOIN security_permissions sp ON sp.id = srp.permission_id
        WHERE sur.user_id = ? AND sp.permission_code = ?
          AND (sur.valid_to IS NULL OR sur.valid_to >= CURDATE())
          AND srp.allow_effect = 'allow'
        LIMIT 1`,
      { replacements: [req.user.id, permissionCode] }
    );
    if (rows.length > 0) return next();
    return res.status(403).json({ error: 'Forbidden', required_permission: permissionCode });
  } catch (e) {
    console.error('[securityGranular] checkPermission error:', e);
    return res.status(403).json({ error: 'Permission check failed' });
  }
};

// ─── SECURITY MODULES ────────────────────────────────────────────────────────

router.get('/security/modules', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM security_modules ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/modules error:', err);
    res.status(500).json({ error: 'Error al listar módulos' });
  }
});

router.put('/security/modules/:code', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { enabled } = req.body;
    if (enabled === undefined) {
      return res.status(400).json({ error: 'enabled es requerido' });
    }

    const [[existing]] = await sequelize.query(
      'SELECT * FROM security_modules WHERE code = ?',
      { replacements: [req.params.code] }
    );
    if (!existing) return res.status(404).json({ error: 'Módulo no encontrado' });

    await sequelize.query(
      `UPDATE security_modules SET enabled = ?, updated_at = NOW() WHERE code = ?`,
      { replacements: [enabled ? 1 : 0, req.params.code] }
    );

    const [[updated]] = await sequelize.query(
      'SELECT * FROM security_modules WHERE code = ?',
      { replacements: [req.params.code] }
    );
    res.json(updated);
  } catch (err) {
    console.error('[securityGranular] PUT /security/modules/:code error:', err);
    res.status(500).json({ error: 'Error al actualizar módulo' });
  }
});

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────

router.get('/security/permissions', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { module_code } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (module_code) { where += ' AND sp.module_code = ?'; params.push(module_code); }

    const [rows] = await sequelize.query(
      `SELECT sp.*, sm.name AS module_name
         FROM security_permissions sp
         LEFT JOIN security_modules sm ON sm.code = sp.module_code
       ${where}
       ORDER BY sp.module_code ASC, sp.permission_code ASC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/permissions error:', err);
    res.status(500).json({ error: 'Error al listar permisos' });
  }
});

// ─── ROLES ───────────────────────────────────────────────────────────────────

router.get('/security/roles', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { company_id, active } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (company_id) { where += ' AND r.company_id = ?';  params.push(Number(company_id)); }
    if (active === '1') { where += ' AND r.active = 1'; }

    const [rows] = await sequelize.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM security_role_permissions srp WHERE srp.role_id = r.id) AS permission_count
         FROM security_roles r
       ${where}
       ORDER BY r.name ASC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/roles error:', err);
    res.status(500).json({ error: 'Error al listar roles' });
  }
});

router.post('/security/roles', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { company_id, code, name, description } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'code y name son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO security_roles (company_id, code, name, description, active, system_role, created_by, created_at, updated_at)
       VALUES (?,?,?,?,1,0,?,NOW(),NOW())`,
      { replacements: [company_id || null, code, name, description || null, req.user.id] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM security_roles WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[securityGranular] POST /security/roles error:', err);
    if (err.original?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un rol con ese código' });
    }
    res.status(500).json({ error: 'Error al crear rol' });
  }
});

router.get('/security/roles/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[role]] = await sequelize.query(
      'SELECT * FROM security_roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });

    const [permissions] = await sequelize.query(
      `SELECT srp.*, sp.permission_code, sp.name AS permission_name,
              sp.module_code, sm.name AS module_name
         FROM security_role_permissions srp
         JOIN security_permissions sp ON sp.id = srp.permission_id
         LEFT JOIN security_modules sm ON sm.code = sp.module_code
        WHERE srp.role_id = ?
        ORDER BY sp.module_code ASC, sp.permission_code ASC`,
      { replacements: [req.params.id] }
    );

    res.json({ ...role, permissions });
  } catch (err) {
    console.error('[securityGranular] GET /security/roles/:id error:', err);
    res.status(500).json({ error: 'Error al obtener rol' });
  }
});

router.put('/security/roles/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, active } = req.body;
    await sequelize.query(
      `UPDATE security_roles
          SET name        = COALESCE(?, name),
              description = COALESCE(?, description),
              active      = COALESCE(?, active),
              updated_at  = NOW()
        WHERE id = ?`,
      { replacements: [name || null, description || null, active !== undefined ? (active ? 1 : 0) : null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM security_roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Rol no encontrado' });
    res.json(updated);
  } catch (err) {
    console.error('[securityGranular] PUT /security/roles/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar rol' });
  }
});

router.delete('/security/roles/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[role]] = await sequelize.query(
      'SELECT * FROM security_roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
    if (role.system_role) {
      return res.status(400).json({ error: 'No se puede deshabilitar un rol de sistema' });
    }

    await sequelize.query(
      `UPDATE security_roles SET active = 0, updated_at = NOW() WHERE id = ?`,
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Rol deshabilitado' });
  } catch (err) {
    console.error('[securityGranular] DELETE /security/roles/:id error:', err);
    res.status(500).json({ error: 'Error al deshabilitar rol' });
  }
});

// ─── ROLE PERMISSIONS ────────────────────────────────────────────────────────

router.post('/security/roles/:id/permissions', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { permission_ids, allow_effect = 'allow' } = req.body;
    if (!Array.isArray(permission_ids) || permission_ids.length === 0) {
      return res.status(400).json({ error: 'permission_ids debe ser un array no vacío' });
    }
    if (!['allow', 'deny'].includes(allow_effect)) {
      return res.status(400).json({ error: 'allow_effect debe ser "allow" o "deny"' });
    }

    const [[role]] = await sequelize.query(
      'SELECT id FROM security_roles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });

    for (const perm_id of permission_ids) {
      await sequelize.query(
        `INSERT INTO security_role_permissions (role_id, permission_id, allow_effect, created_by, created_at, updated_at)
         VALUES (?,?,?,?,NOW(),NOW())
         ON DUPLICATE KEY UPDATE allow_effect=VALUES(allow_effect), updated_at=NOW()`,
        { replacements: [req.params.id, perm_id, allow_effect, req.user.id] }
      );
    }

    const [updated] = await sequelize.query(
      `SELECT srp.*, sp.permission_code, sp.name AS permission_name
         FROM security_role_permissions srp
         JOIN security_permissions sp ON sp.id = srp.permission_id
        WHERE srp.role_id = ?`,
      { replacements: [req.params.id] }
    );
    res.json({ role_id: Number(req.params.id), permissions: updated });
  } catch (err) {
    console.error('[securityGranular] POST /security/roles/:id/permissions error:', err);
    res.status(500).json({ error: 'Error al asignar permisos' });
  }
});

router.delete('/security/roles/:roleId/permissions/:permissionId', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    await sequelize.query(
      `DELETE FROM security_role_permissions WHERE role_id = ? AND permission_id = ?`,
      { replacements: [req.params.roleId, req.params.permissionId] }
    );
    res.json({ message: 'Permiso removido del rol' });
  } catch (err) {
    console.error('[securityGranular] DELETE /security/roles/:roleId/permissions/:permissionId error:', err);
    res.status(500).json({ error: 'Error al remover permiso' });
  }
});

// ─── USER ROLES ──────────────────────────────────────────────────────────────

router.get('/security/users/:userId/roles', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT sur.*, r.code AS role_code, r.name AS role_name,
              c.legal_name AS company_name, b.name AS branch_name,
              d.name AS department_name
         FROM security_user_roles sur
         JOIN security_roles r ON r.id = sur.role_id
         LEFT JOIN companies c ON c.id = sur.company_id
         LEFT JOIN branches b ON b.id = sur.branch_id
         LEFT JOIN departments d ON d.id = sur.department_id
        WHERE sur.user_id = ?
        ORDER BY r.name ASC`,
      { replacements: [req.params.userId] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/users/:userId/roles error:', err);
    res.status(500).json({ error: 'Error al obtener roles del usuario' });
  }
});

router.post('/security/users/:userId/roles', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { role_id, company_id, branch_id, department_id, valid_from, valid_to } = req.body;
    if (!role_id) return res.status(400).json({ error: 'role_id es requerido' });

    const [result] = await sequelize.query(
      `INSERT INTO security_user_roles
         (user_id, role_id, company_id, branch_id, department_id, valid_from, valid_to, assigned_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())`,
      {
        replacements: [
          req.params.userId, role_id,
          company_id || null, branch_id || null, department_id || null,
          valid_from || null, valid_to || null,
          req.user.id,
        ],
      }
    );
    const [[created]] = await sequelize.query(
      `SELECT sur.*, r.code AS role_code, r.name AS role_name
         FROM security_user_roles sur
         JOIN security_roles r ON r.id = sur.role_id
        WHERE sur.id = ?`,
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[securityGranular] POST /security/users/:userId/roles error:', err);
    res.status(500).json({ error: 'Error al asignar rol al usuario' });
  }
});

router.delete('/security/users/:userId/roles/:roleId', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    await sequelize.query(
      `DELETE FROM security_user_roles WHERE user_id = ? AND role_id = ?`,
      { replacements: [req.params.userId, req.params.roleId] }
    );
    res.json({ message: 'Rol removido del usuario' });
  } catch (err) {
    console.error('[securityGranular] DELETE /security/users/:userId/roles/:roleId error:', err);
    res.status(500).json({ error: 'Error al remover rol del usuario' });
  }
});

// ─── EFFECTIVE USER PERMISSIONS ──────────────────────────────────────────────

router.get('/security/user-permissions/:userId', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT DISTINCT sp.id, sp.permission_code, sp.name, sp.module_code,
              sm.name AS module_name, srp.allow_effect,
              r.code AS via_role_code, r.name AS via_role_name
         FROM security_user_roles sur
         JOIN security_roles r ON r.id = sur.role_id AND r.active = 1
         JOIN security_role_permissions srp ON srp.role_id = sur.role_id
         JOIN security_permissions sp ON sp.id = srp.permission_id
         LEFT JOIN security_modules sm ON sm.code = sp.module_code
        WHERE sur.user_id = ?
          AND (sur.valid_to IS NULL OR sur.valid_to >= CURDATE())
        ORDER BY sp.module_code ASC, sp.permission_code ASC`,
      { replacements: [req.params.userId] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/user-permissions/:userId error:', err);
    res.status(500).json({ error: 'Error al obtener permisos efectivos' });
  }
});

// ─── FIELD PERMISSIONS ───────────────────────────────────────────────────────
// Table: security_field_permissions (entity_name, field_name, can_view, can_edit, mask_rule)

// GET by role_id query param: GET /security/field-permissions?role_id=X
router.get('/security/field-permissions', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { role_id } = req.query;
    if (!role_id) return res.status(400).json({ error: 'role_id es requerido' });
    const [rows] = await sequelize.query(
      `SELECT * FROM security_field_permissions WHERE role_id = ? ORDER BY entity_name ASC, field_name ASC`,
      { replacements: [Number(role_id)] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/field-permissions error:', err);
    res.status(500).json({ error: 'Error al obtener permisos de campo' });
  }
});

// Legacy path param (backwards compat): GET /security/field-permissions/:roleId
router.get('/security/field-permissions/:roleId', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM security_field_permissions WHERE role_id = ? ORDER BY entity_name ASC, field_name ASC`,
      { replacements: [Number(req.params.roleId)] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/field-permissions/:roleId error:', err);
    res.status(500).json({ error: 'Error al obtener permisos de campo' });
  }
});

router.post('/security/field-permissions', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { role_id, entity_name, field_name, can_view, can_edit, mask_rule } = req.body;
    if (!role_id || !entity_name || !field_name) {
      return res.status(400).json({ error: 'role_id, entity_name y field_name son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO security_field_permissions (role_id, entity_name, field_name, can_view, can_edit, mask_rule)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE can_view=VALUES(can_view), can_edit=VALUES(can_edit), mask_rule=VALUES(mask_rule)`,
      { replacements: [role_id, entity_name, field_name, can_view !== false ? 1 : 0, can_edit ? 1 : 0, mask_rule || null] }
    );
    const insertId = typeof result === 'object' && result.insertId ? result.insertId : result;
    const [[created]] = await sequelize.query(
      'SELECT * FROM security_field_permissions WHERE id = ?',
      { replacements: [insertId] }
    );
    res.status(201).json({ ...created, id: created?.id ?? insertId });
  } catch (err) {
    console.error('[securityGranular] POST /security/field-permissions error:', err);
    res.status(500).json({ error: 'Error al establecer permiso de campo' });
  }
});

router.put('/security/field-permissions/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { can_view, can_edit, mask_rule } = req.body;
    await sequelize.query(
      `UPDATE security_field_permissions
          SET can_view  = COALESCE(?, can_view),
              can_edit  = COALESCE(?, can_edit),
              mask_rule = ?
        WHERE id = ?`,
      { replacements: [
          can_view !== undefined ? (can_view ? 1 : 0) : null,
          can_edit !== undefined ? (can_edit ? 1 : 0) : null,
          mask_rule !== undefined ? (mask_rule || null) : null,
          Number(req.params.id),
        ] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM security_field_permissions WHERE id = ?',
      { replacements: [Number(req.params.id)] }
    );
    if (!updated) return res.status(404).json({ error: 'Permiso de campo no encontrado' });
    res.json(updated);
  } catch (err) {
    console.error('[securityGranular] PUT /security/field-permissions/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar permiso de campo' });
  }
});

router.delete('/security/field-permissions/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    await sequelize.query(
      'DELETE FROM security_field_permissions WHERE id = ?',
      { replacements: [Number(req.params.id)] }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[securityGranular] DELETE /security/field-permissions/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar permiso de campo' });
  }
});

// ─── TEST ACCESS ─────────────────────────────────────────────────────────────

router.post('/security/test-access', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { user_id, permission_code } = req.body;
    if (!user_id || !permission_code) {
      return res.status(400).json({ error: 'user_id y permission_code son requeridos' });
    }

    // Check if super admin / legacy admin
    const [[user]] = await sequelize.query(
      'SELECT role FROM users WHERE id = ?',
      { replacements: [user_id] }
    );
    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
      return res.json({ hasAccess: true, via_role: user.role, conditions: { bypass: 'admin_role' } });
    }

    const [rows] = await sequelize.query(
      `SELECT srp.allow_effect, r.code AS role_code, r.name AS role_name,
              sur.valid_from, sur.valid_to, sur.company_id, sur.branch_id, sur.department_id
         FROM security_user_roles sur
         JOIN security_roles r ON r.id = sur.role_id AND r.active = 1
         JOIN security_role_permissions srp ON srp.role_id = sur.role_id
         JOIN security_permissions sp ON sp.id = srp.permission_id
        WHERE sur.user_id = ? AND sp.permission_code = ?
          AND (sur.valid_to IS NULL OR sur.valid_to >= CURDATE())
        ORDER BY srp.allow_effect DESC
        LIMIT 1`,
      { replacements: [user_id, permission_code] }
    );

    if (rows.length > 0 && rows[0].allow_effect === 'allow') {
      const row = rows[0];
      return res.json({
        hasAccess: true,
        via_role: row.role_code,
        conditions: {
          company_id: row.company_id,
          branch_id: row.branch_id,
          department_id: row.department_id,
          valid_from: row.valid_from,
          valid_to: row.valid_to,
        },
      });
    }

    res.json({ hasAccess: false, via_role: null, conditions: {} });
  } catch (err) {
    console.error('[securityGranular] POST /security/test-access error:', err);
    res.status(500).json({ error: 'Error al verificar acceso' });
  }
});

// ─── SECURITY AUDIT LOG ──────────────────────────────────────────────────────

router.get('/security/audit', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { user_id, action, date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (user_id)   { where += ' AND sal.user_id = ?';       params.push(Number(user_id)); }
    if (action)    { where += ' AND sal.action = ?';         params.push(action); }
    if (date_from) { where += ' AND sal.created_at >= ?';    params.push(date_from); }
    if (date_to)   { where += ' AND sal.created_at <= ?';    params.push(date_to); }

    const [rows] = await sequelize.query(
      `SELECT sal.*, u.email AS user_email,
              CONCAT(u.first_name,' ',u.last_name) AS user_name
         FROM security_audit_logs sal
         LEFT JOIN users u ON u.id = sal.user_id
       ${where}
       ORDER BY sal.created_at DESC
       LIMIT 500`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/audit error:', err);
    res.status(500).json({ error: 'Error al obtener auditoría de seguridad' });
  }
});

// ─── DATA SCOPES ─────────────────────────────────────────────────────────────

router.get('/security/data-scopes/:userId', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT sds.*, r.code AS role_code, r.name AS role_name
         FROM security_data_scopes sds
         LEFT JOIN security_roles r ON r.id = sds.role_id
        WHERE sds.user_id = ?
        ORDER BY sds.scope_type ASC`,
      { replacements: [req.params.userId] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[securityGranular] GET /security/data-scopes/:userId error:', err);
    res.status(500).json({ error: 'Error al obtener scopes de datos' });
  }
});

router.post('/security/data-scopes', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { user_id, role_id, scope_type, scope_value } = req.body;
    if (!user_id || !scope_type || !scope_value) {
      return res.status(400).json({ error: 'user_id, scope_type y scope_value son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO security_data_scopes (user_id, role_id, scope_type, scope_value, assigned_by, created_at, updated_at)
       VALUES (?,?,?,?,?,NOW(),NOW())`,
      { replacements: [user_id, role_id || null, scope_type, scope_value, req.user.id] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM security_data_scopes WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[securityGranular] POST /security/data-scopes error:', err);
    res.status(500).json({ error: 'Error al asignar scope de datos' });
  }
});

router.delete('/security/data-scopes/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM security_data_scopes WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Scope no encontrado' });

    await sequelize.query(
      'DELETE FROM security_data_scopes WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Scope removido' });
  } catch (err) {
    console.error('[securityGranular] DELETE /security/data-scopes/:id error:', err);
    res.status(500).json({ error: 'Error al remover scope' });
  }
});

module.exports = router;
module.exports.checkPermission = checkPermission;
