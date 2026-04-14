/**
 * sync.js
 * Endpoints para leer y sincronizar datos desde att2000 (SQL Server)
 * hacia la nueva base de datos MySQL.
 *
 * Todos requieren rol admin.
 *
 * Flujo recomendado:
 *   1. GET  /api/sync/test        → verificar conexión a att2000
 *   2. POST /api/sync/full        → sincronización completa (primera vez)
 *   3. POST /api/sync/attendance  → solo re-importar marcajes de un período
 *   4. GET  /api/sync/checkinout  → ver datos crudos de CHECKINOUT
 *   5. GET  /api/sync/users       → ver USERINFO crudo
 */

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { testAtt2000Connection }   = require('../config/att2000');
const {
  fetchCheckInOut, fetchUserInfo, fetchDepartments,
  fetchShifts, fetchMachines,
  syncDepartments, syncEmployees, syncAttendance,
  syncMachines, syncHolidays, fullSync,
} = require('../config/zkAdapter');

router.use(authenticate, authorize('admin'));

// ─── GET /api/sync/test — Probar conexión con config del .env ────
router.get('/test', async (req, res) => {
  const result = await testAtt2000Connection();
  res.status(result.ok ? 200 : 503).json(result);
});

// ─── POST /api/sync/test-conn — Probar conexión dinámica ─────────
// Body: { host, port, database, user, password }
router.post('/test-conn', async (req, res) => {
  const { host, port, database, user, password } = req.body;
  if (!host || !database || !user) {
    return res.status(400).json({ ok: false, error: 'host, database y user son requeridos' });
  }
  const sql = require('mssql');
  const cfg = {
    server: host,
    port: parseInt(port || '1433'),
    user,
    password: password || '',
    database,
    options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 }
  };
  try {
    const pool = await sql.connect(cfg);
    const r = await pool.request().query('SELECT COUNT(*) AS total FROM CHECKINOUT');
    await pool.close();
    res.json({ ok: true, totalRecords: r.recordset[0].total });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/full — Sincronización completa ───────────────
// Body: { dateFrom, dateTo, conn?: { host, port, database, user, password } }
router.post('/full', async (req, res) => {
  const { dateFrom, dateTo, conn } = req.body;
  // Si viene conn dinámico, inyectarlo al env temporalmente
  if (conn) {
    process.env.ATT_HOST     = conn.host     || process.env.ATT_HOST;
    process.env.ATT_PORT     = conn.port     || process.env.ATT_PORT;
    process.env.ATT_DATABASE = conn.database || process.env.ATT_DATABASE;
    process.env.ATT_USER     = conn.user     || process.env.ATT_USER;
    process.env.ATT_PASSWORD = conn.password !== undefined ? conn.password : process.env.ATT_PASSWORD;
  }
  try {
    const result = await fullSync({ dateFrom, dateTo });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/departments ──────────────────────────────────
router.post('/departments', async (req, res) => {
  try {
    res.json({ ok: true, ...(await syncDepartments()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/employees ────────────────────────────────────
router.post('/employees', async (req, res) => {
  try {
    res.json({ ok: true, ...(await syncEmployees()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/attendance — Importar marcajes ───────────────
// Body: { dateFrom: "2026-04-01", dateTo: "2026-04-11", limit: 10000 }
router.post('/attendance', async (req, res) => {
  const { dateFrom, dateTo, limit = 10000 } = req.body;
  try {
    const result = await syncAttendance({ dateFrom, dateTo, limit });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/machines ──────────────────────────────────────
router.post('/machines', async (req, res) => {
  try {
    res.json({ ok: true, ...(await syncMachines()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sync/checkinout — Ver CHECKINOUT crudo ─────────────
router.get('/checkinout', async (req, res) => {
  const { from, to, limit = 50 } = req.query;
  try {
    const rows = await fetchCheckInOut({ dateFrom: from, dateTo: to, limit: +limit });
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/users — Ver USERINFO crudo ────────────────────
router.get('/users', async (req, res) => {
  try {
    const rows = await fetchUserInfo();
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/shifts — Ver SHIFT (horarios) ─────────────────
router.get('/shifts', async (req, res) => {
  try {
    const rows = await fetchShifts();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/machines-list ─────────────────────────────────
router.get('/machines-list', async (req, res) => {
  try {
    const rows = await fetchMachines();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
