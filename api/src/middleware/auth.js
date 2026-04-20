const jwt = require('jsonwebtoken');

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

module.exports = { authenticate, authorize, requireSuperAdmin, authenticateServiceKey };
