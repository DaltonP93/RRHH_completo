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

// Verificar rol requerido
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

// Clave interna entre servicios (Bridge → API)
function authenticateServiceKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== process.env.BRIDGE_API_KEY) {
    return res.status(401).json({ error: 'Clave de servicio inválida' });
  }
  next();
}

module.exports = { authenticate, authorize, authenticateServiceKey };
