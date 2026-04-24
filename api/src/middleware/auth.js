const jwt = require('jsonwebtoken');
const { sequelize } = require('../config/database');
const { defaultsForRole } = require('../services/permissionMatrix');

// Verificar token JWT
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Verificar rol requerido.
// super_admin siempre tiene acceso a todo (bypass implícito).
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.role === 'super_admin') return next();  // super_admin bypass
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

// Restricción estricta: SOLO super_admin (relojes, BD, sync, módulo sistema).
// No hay bypass — ni admin ni GTH pueden entrar.
function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Requiere permisos de super-administrador' });
  }
  next();
}

// Clave interna entre servicios (Bridge → API)
function authenticateServiceKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== process.env.BRIDGE_API_KEY) {
    return res.status(401).json({ error: 'Clave de servicio inválida' });
  }
  next();
}

/**
 * requirePermission(module, action)
 *
 * Valida permisos granulares sobre user_permissions. Si el usuario no tiene
 * overrides, aplica los defaults del rol (services/permissionMatrix.js).
 *
 *  - super_admin/admin: bypass total.
 *  - action: 'view' | 'create' | 'update' | 'delete'.
 *  - Respeta la ruta: si falla, 403.
 */
function requirePermission(moduleKey, action) {
  const field = {
    view:   'can_view',
    create: 'can_create',
    update: 'can_update',
    delete: 'can_delete',
  }[action];
  if (!field) throw new Error(`Acción inválida: ${action}`);

  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.role === 'super_admin' || req.user.role === 'admin') return next();

    try {
      const [rows] = await sequelize.query(
        'SELECT can_view, can_create, can_update, can_delete FROM user_permissions WHERE user_id = ? AND module = ? LIMIT 1',
        { replacements: [req.user.id, moduleKey] }
      );
      const flags = rows.length
        ? rows[0]
        : defaultsForRole(req.user.role)[moduleKey];
      if (!flags || !flags[field]) {
        return res.status(403).json({
          error: `Sin permisos (${action}) sobre módulo '${moduleKey}'`,
        });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
}

module.exports = { authenticate, authorize, requireSuperAdmin, authenticateServiceKey, requirePermission };
