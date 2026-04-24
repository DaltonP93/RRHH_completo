require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { sequelize } = require('./config/database');
const { initRedis } = require('./config/redis');
const { initSocket } = require('./socket/socketServer');
const logger = require('./config/logger');

// Rutas
const authRoutes       = require('./routes/auth');
const employeeRoutes   = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const deviceRoutes     = require('./routes/devices');
const scheduleRoutes   = require('./routes/schedules');
const reportRoutes     = require('./routes/reports');
const permissionRoutes = require('./routes/permissions');
const syncRoutes            = require('./routes/sync');
const { router: webhookRoutes } = require('./routes/webhooks');
const integrationRoutes     = require('./routes/integration');
const userRoutes            = require('./routes/users');
const notificationRoutes    = require('./routes/notifications');
const settingsRoutes        = require('./routes/settings');
const hrSourceRoutes        = require('./routes/hrSources');
const processingRoutes      = require('./routes/processing');
const departmentRoutes      = require('./routes/departments');
const approvalRulesRoutes   = require('./routes/approvalRules');
const meRoutes              = require('./routes/me');
const auditRoutes           = require('./routes/audit');
const holidayRoutes         = require('./routes/holidays');
const branchRoutes          = require('./routes/branches');
const justificationsBulk    = require('./routes/justificationsBulk');
const executiveRoutes       = require('./routes/executive');
const selfCheckinRoutes     = require('./routes/selfCheckin');
const payrollRoutes         = require('./routes/payroll');
const supervisorRoutes      = require('./routes/supervisor');
const swaggerUi    = require('swagger-ui-express');
const swaggerSpec  = require('./config/swagger');

const app = express();
const server = http.createServer(app);

// ─── Middleware ─────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://sishoras.saa.com.py',
      'https://sishoras.saa.com.py'
    ].filter(Boolean);
    // Permitir requests sin origin (curl, Postman, SSR)
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true
}));
// Servir uploads locales (logos, favicons, bg)
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500,
  message: { error: 'Demasiadas solicitudes, intenta más tarde.' }
}));

// Rate limiting estricto para login (anti fuerza bruta)
// Solo cuenta intentos fallidos, no consultas /me, /refresh, /logout.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Espere 15 minutos.' }
});

// Rate limiting general para el resto de /api/auth/*
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas solicitudes de autenticación.' }
});

// ─── Rutas ──────────────────────────────────────────────────────
// Aplica loginLimiter SOLO a POST /api/auth/login (anti brute-force),
// y un authLimiter más permisivo a todo lo demás del módulo.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',        authLimiter, authRoutes);
app.use('/api/employees',   employeeRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/devices',     deviceRoutes);
app.use('/api/schedules',   scheduleRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/sync',        syncRoutes);
app.use('/api/webhooks',       webhookRoutes);
app.use('/api/integration',    integrationRoutes);
app.use('/api/users',          userRoutes);
app.use('/api/notifications',  notificationRoutes);
app.use('/api/settings',       settingsRoutes);
app.use('/api/hr-sources',     hrSourceRoutes);
app.use('/api/processing',     processingRoutes);
app.use('/api/departments',    departmentRoutes);
app.use('/api/approval-rules', approvalRulesRoutes);
app.use('/api/me',             meRoutes);
app.use('/api/audit',          auditRoutes);
app.use('/api/holidays',       holidayRoutes);
app.use('/api/branches',       branchRoutes);
app.use('/api/justifications', justificationsBulk);
app.use('/api/executive',      executiveRoutes);
app.use('/api/self-checkin',   selfCheckinRoutes);
app.use('/api/payroll',        payrollRoutes);
app.use('/api/supervisor',     supervisorRoutes);

// Documentación Swagger UI — http://localhost:4000/api/docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Sistema de Asistencia — API Docs',
}));
// JSON spec para consumir desde Oracle APEX / Postman
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Manejo de errores ──────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl}`);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor'
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── Inicio ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function start() {
  try {
    // Conectar Redis
    await initRedis();
    logger.info('✅ Redis conectado');

    // Inicializar scheduler de reportes automáticos
    const { loadSchedules, startAtt2000PullCron, startDailyAlertsCron } = require('./services/scheduler');
    setTimeout(() => loadSchedules().catch(() => {}), 5000);
    startAtt2000PullCron();
    startDailyAlertsCron();

    // Reconciliación nocturna att2000 vs MySQL
    const { startReconciliationCron } = require('./services/reconciliation');
    startReconciliationCron();

    // Schedules de sincronización HR externa
    const { loadHrSchedules } = require('./services/hrSourceSync');
    setTimeout(() => loadHrSchedules().catch(() => {}), 6000);

    // Conectar MySQL
    await sequelize.authenticate();
    logger.info('✅ MySQL conectado');

    // Inicializar Socket.io
    initSocket(server);
    logger.info('✅ Socket.io inicializado');

    server.listen(PORT, () => {
      logger.info(`🚀 API corriendo en puerto ${PORT}`);
    });
  } catch (err) {
    logger.error('❌ Error al iniciar:', err);
    process.exit(1);
  }
}

start();

module.exports = { app, server };
