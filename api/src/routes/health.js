/**
 * health.js — Endpoints de observabilidad.
 *   GET /api/health           — liveness simple (público)
 *   GET /api/health/detailed  — estado de dependencias (admin)
 *     · MySQL (asistencia)
 *     · Redis
 *     · att2000 (SQL Server origen)
 *     · Bridge ZKTeco (puerto 8081)
 *     · Memoria del proceso, uptime, versiones
 */
const router = require('express').Router();
const os = require('os');
const { sequelize } = require('../config/database');
const { getRedis } = require('../config/redis');
const { authenticate, authorize } = require('../middleware/auth');

const pkg = require('../../package.json');
const START = Date.now();

async function checkMysql() {
  const t0 = Date.now();
  try {
    await sequelize.query('SELECT 1 AS ok');
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - t0, error: err.message };
  }
}

async function checkRedis() {
  const t0 = Date.now();
  try {
    const r = typeof getRedis === 'function' ? getRedis() : null;
    if (!r) return { ok: false, error: 'Redis no inicializado' };
    await r.ping();
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - t0, error: err.message };
  }
}

async function checkAtt2000() {
  const t0 = Date.now();
  try {
    const { queryAtt2000 } = require('../config/att2000');
    await queryAtt2000('SELECT TOP 1 1 AS ok FROM CHECKINOUT');
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - t0, error: err.message };
  }
}

async function checkBridge() {
  const t0 = Date.now();
  const url = process.env.BRIDGE_URL || 'http://localhost:8081';
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    clearTimeout(to);
    return { ok: res.ok, latency_ms: Date.now() - t0, status: res.status };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - t0, error: err.message };
  }
}

// Liveness público
router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Detailed: solo admin/gth/super_admin
router.get('/detailed', authenticate, authorize('admin', 'gth'), async (req, res) => {
  const [mysql, redis, att2000, bridge] = await Promise.all([
    checkMysql(), checkRedis(), checkAtt2000(), checkBridge(),
  ]);
  const mem = process.memoryUsage();
  const allOk = mysql.ok && redis.ok;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime_sec: Math.round((Date.now() - START) / 1000),
    version: pkg.version || '0.0.0',
    node: process.version,
    host: os.hostname(),
    checks: { mysql, redis, att2000, bridge },
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    loadavg: os.loadavg(),
  });
});

// ─── /api/health/storage — estado del sistema de archivos ─────────
router.get('/storage', authenticate, authorize('admin', 'super_admin'), async (req, res) => {
  const t0 = Date.now();
  const checks = {};

  // Upload dir
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');
    const stats = fs.statfsSync ? fs.statfsSync(uploadDir) : null;
    const testFile = path.join(uploadDir, '.health_probe');
    fs.writeFileSync(testFile, Date.now().toString());
    fs.unlinkSync(testFile);
    checks.uploads = {
      ok: true,
      path: uploadDir,
      writable: true,
      ...(stats ? {
        total_gb: Math.round(stats.blocks * stats.bsize / 1e9 * 100) / 100,
        free_gb:  Math.round(stats.bfree  * stats.bsize / 1e9 * 100) / 100,
      } : {}),
    };
  } catch (err) {
    checks.uploads = { ok: false, error: err.message };
  }

  // Backup dir
  try {
    const fs = require('fs');
    const path = require('path');
    const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../../../backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir, { recursive: false });
      checks.backups = { ok: true, path: backupDir, top_level_entries: files.length };
    } else {
      checks.backups = { ok: false, error: 'Directorio de backups no existe' };
    }
  } catch (err) {
    checks.backups = { ok: false, error: err.message };
  }

  const allOk = Object.values(checks).every(c => c.ok);
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    latency_ms: Date.now() - t0,
    checks,
  });
});

// ─── /api/health/workers — estado de los workers PM2 ──────────────
router.get('/workers', authenticate, authorize('admin', 'super_admin'), async (req, res) => {
  const t0 = Date.now();
  const workerNames = [
    'worker-sync', 'worker-notifications', 'worker-payroll',
    'worker-documents', 'worker-backups',
  ];

  // Leer state desde payroll_runs (worker-payroll), source_sync_runs (worker-sync)
  // y notification_queue (worker-notifications) para ver actividad reciente
  const checks = {};

  try {
    // worker-payroll: último run procesado
    const [[lastPayroll]] = await sequelize.query(`
      SELECT status, finished_at FROM payroll_runs
      WHERE status IN ('calculated','failed')
      ORDER BY finished_at DESC LIMIT 1
    `).catch(() => [[null]]);
    checks['worker-payroll'] = {
      last_run: lastPayroll?.finished_at || null,
      last_status: lastPayroll?.status || 'unknown',
    };

    // worker-sync: último sync run
    const [[lastSync]] = await sequelize.query(`
      SELECT status, finished_at FROM source_sync_runs
      ORDER BY finished_at DESC LIMIT 1
    `).catch(() => [[null]]);
    checks['worker-sync'] = {
      last_run: lastSync?.finished_at || null,
      last_status: lastSync?.status || 'unknown',
    };

    // worker-notifications: pendientes en cola
    const [[nqStats]] = await sequelize.query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status='failed'  THEN 1 ELSE 0 END) AS failed
      FROM notification_queue
      WHERE created_at >= NOW() - INTERVAL 1 HOUR
    `).catch(() => [[{ total: 0, pending: 0, failed: 0 }]]);
    checks['worker-notifications'] = {
      last_hour_total: nqStats?.total || 0,
      last_hour_pending: nqStats?.pending || 0,
      last_hour_failed: nqStats?.failed || 0,
    };
  } catch (err) {
    checks.db_error = { ok: false, error: err.message };
  }

  res.json({
    status: 'ok',
    latency_ms: Date.now() - t0,
    timestamp: new Date().toISOString(),
    note: 'Para estado PM2 en tiempo real, usar: pm2 status en el servidor',
    workers: workerNames,
    checks,
  });
});

module.exports = router;
