'use strict';
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

// Cache de permisos por usuario (TTL 60s)
const _permCache = new Map(); // userId → { perms: Set, expires: number }

async function getUserPermissions(userId) {
  const now = Date.now();
  const cached = _permCache.get(userId);
  if (cached && cached.expires > now) return cached.perms;

  const [rows] = await sequelize.query(`
    SELECT DISTINCT pc.code
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.allowed = 1
    JOIN permissions_catalog pc ON pc.id = rp.permission_id
    WHERE ur.user_id = ?
  `, { replacements: [userId] });

  const perms = new Set(rows.map(r => r.code));
  _permCache.set(userId, { perms, expires: now + 60_000 });
  return perms;
}

function clearPermCache(userId) {
  if (userId) _permCache.delete(userId);
  else _permCache.clear();
}

// Middleware: require specific permission. super_admin bypasses.
function requirePermission(permCode) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'No autenticado' });
      if (req.user.role === 'super_admin') return next();
      const perms = await getUserPermissions(req.user.id);
      if (perms.has(permCode)) return next();
      logger.warn(`Permission denied: user ${req.user.id} missing ${permCode}`);
      return res.status(403).json({ error: 'Permiso insuficiente', required: permCode });
    } catch (err) {
      logger.error('requirePermission error:', err.message);
      return next(); // fail open on DB error to avoid locking users out
    }
  };
}

// Middleware: require any of the listed permissions
function requireAnyPermission(permCodes) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'No autenticado' });
      if (req.user.role === 'super_admin') return next();
      const perms = await getUserPermissions(req.user.id);
      if (permCodes.some(p => perms.has(p))) return next();
      return res.status(403).json({ error: 'Permiso insuficiente', required: permCodes });
    } catch (err) {
      return next();
    }
  };
}

// Middleware: require scope constraint (e.g. company-level)
function requireScope({ scope }) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'No autenticado' });
      if (req.user.role === 'super_admin') return next();
      const [[userScope]] = await sequelize.query(
        `SELECT scope_type FROM user_scopes WHERE user_id = ? AND scope_type IN (?, 'global') LIMIT 1`,
        { replacements: [req.user.id, scope] }
      );
      if (userScope) return next();
      return res.status(403).json({ error: 'Alcance insuficiente', required: scope });
    } catch (err) {
      return next();
    }
  };
}

// Helper: build WHERE clause additions based on user scope
async function filterByUserScope(req, baseWhere = {}) {
  if (!req.user || req.user.role === 'super_admin') return baseWhere;
  const [[scope]] = await sequelize.query(
    `SELECT scope_type, company_id, branch_id, department_id, employee_id FROM user_scopes WHERE user_id = ? ORDER BY FIELD(scope_type,'global','company','branch','department','team','own') LIMIT 1`,
    { replacements: [req.user.id] }
  ).catch(() => [[null]]);
  if (!scope || scope.scope_type === 'global') return baseWhere;
  const extra = {};
  if (scope.company_id)    extra.company_id    = scope.company_id;
  if (scope.branch_id)     extra.branch_id     = scope.branch_id;
  if (scope.department_id) extra.department_id = scope.department_id;
  return { ...baseWhere, ...extra };
}

// Check if user can access a specific employee
async function canAccessEmployee(user, employeeId) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const [[scope]] = await sequelize.query(
    `SELECT us.scope_type, us.company_id, us.branch_id, us.department_id, us.employee_id,
            e.company_id AS emp_company_id, e.branch_id AS emp_branch_id, e.department_id AS emp_dept_id
     FROM user_scopes us
     LEFT JOIN employees e ON e.id = ?
     WHERE us.user_id = ?
     ORDER BY FIELD(us.scope_type,'global','company','branch','department','team','own') LIMIT 1`,
    { replacements: [employeeId, user.id] }
  ).catch(() => [[null]]);
  if (!scope) return false;
  if (scope.scope_type === 'global') return true;
  if (scope.scope_type === 'company'    && scope.company_id === scope.emp_company_id)   return true;
  if (scope.scope_type === 'branch'     && scope.branch_id  === scope.emp_branch_id)    return true;
  if (scope.scope_type === 'department' && scope.department_id === scope.emp_dept_id)   return true;
  if (scope.scope_type === 'own'        && scope.employee_id === Number(employeeId))     return true;
  return false;
}

// Check if user can view a sensitive field
async function canViewField(user, entity, fieldName) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const [[fp]] = await sequelize.query(`
    SELECT fp.can_view FROM field_permissions fp
    JOIN user_roles ur ON ur.role_id = fp.role_id
    WHERE ur.user_id = ? AND fp.entity = ? AND fp.field_name = ?
    LIMIT 1
  `, { replacements: [user.id, entity, fieldName] }).catch(() => [[null]]);
  return fp?.can_view === 1;
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireScope,
  filterByUserScope,
  canAccessEmployee,
  canViewField,
  clearPermCache,
  getUserPermissions,
};
