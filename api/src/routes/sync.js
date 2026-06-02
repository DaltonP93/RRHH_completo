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
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { testAtt2000Connection, writeCheckinOut, resetPool } = require('../config/att2000');
const { sequelize } = require('../config/database');
const {
  fetchCheckInOut, fetchUserInfo, fetchDepartments,
  fetchShifts, fetchMachines,
  syncDepartments, syncEmployees, syncAttendance,
  syncMachines, syncHolidays, fullSync,
} = require('../config/zkAdapter');

// Todo el módulo de sincronización con att2000 está restringido a super_admin.
// La gestión de BD fuente NO debe ser visible al rol GTH/admin.
router.use(authenticate, requireSuperAdmin);

// ─── GET /api/sync/test — Probar conexión con config del .env ────
router.get('/test', async (req, res) => {
  const result = await testAtt2000Connection();
  res.status(result.ok ? 200 : 503).json(result);
});

// ─── POST /api/sync/test-conn — Probar conexión dinámica ─────────
// Body: { host, port, database, user, password }
// Al probar con éxito, actualiza los env vars para que fullSync use esa conexión.
router.post('/test-conn', async (req, res) => {
  const { host, port, database, user, password } = req.body;
  if (!host || !database || !user) {
    return res.status(400).json({ ok: false, error: 'host, database y user son requeridos' });
  }
  const sql = require('mssql');
  const cfg = {
    server:   host,
    port:     parseInt(port || '1433'),
    user,
    password: password ?? '',
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 10000,
      requestTimeout:  15000,
    }
  };
  let tmpPool = null;
  try {
    tmpPool = await new sql.ConnectionPool(cfg).connect();

    const [rCheckin, rUsers, rMachines, rRecent] = await Promise.all([
      tmpPool.request().query('SELECT COUNT(*) AS total FROM CHECKINOUT'),
      tmpPool.request().query('SELECT COUNT(*) AS total FROM USERINFO').catch(() => ({ recordset: [{ total: 0 }] })),
      tmpPool.request().query('SELECT MACHINE_ALIAS, IP_ADDRESS FROM MACHINES').catch(() => ({ recordset: [] })),
      tmpPool.request().query(`
        SELECT TOP 8 c.USERID, ui.Name AS nombre, c.CHECKTIME, c.CHECKTYPE
        FROM CHECKINOUT c
        LEFT JOIN USERINFO ui ON ui.USERID = c.USERID
        ORDER BY c.CHECKTIME DESC
      `).catch(() => ({ recordset: [] })),
    ]);

    await tmpPool.close();

    // Guardar parámetros probados para que fullSync los use
    resetPool();
    process.env.ATT_HOST     = host;
    process.env.ATT_PORT     = String(port || '1433');
    process.env.ATT_DATABASE = database;
    process.env.ATT_USER     = user;
    process.env.ATT_PASSWORD = password ?? '';

    res.json({
      ok: true,
      totalRecords:   rCheckin.recordset[0].total,
      totalEmployees: rUsers.recordset[0].total,
      machines:       rMachines.recordset,
      recentRecords:  rRecent.recordset,
    });
  } catch (err) {
    if (tmpPool) try { await tmpPool.close(); } catch {}
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/full — Sincronización completa ───────────────
// Body: { dateFrom, dateTo, conn?: { host, port, database, user, password } }
router.post('/full', async (req, res) => {
  const { dateFrom, dateTo, conn } = req.body;

  // Si viene conn dinámico, resetear el pool y actualizar env vars
  // (el pool cacheado puede apuntar a otro host)
  if (conn) {
    resetPool();  // ← fuerza nueva conexión con los parámetros recibidos
    if (conn.host     !== undefined) process.env.ATT_HOST     = conn.host;
    if (conn.port     !== undefined) process.env.ATT_PORT     = String(conn.port);
    if (conn.database !== undefined) process.env.ATT_DATABASE = conn.database;
    if (conn.user     !== undefined) process.env.ATT_USER     = conn.user;
    if (conn.password !== undefined) process.env.ATT_PASSWORD = conn.password;
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

// ─── POST /api/sync/employees-from-att2000 ───────────────────────
// Sincroniza departamentos + empleados desde att2000 y devuelve
// estadísticas de calidad (nombres, departamentos) tras la sincronización.
router.post('/employees-from-att2000', async (req, res) => {
  try {
    // 1. Departamentos primero — los empleados referencian department_id
    const deptResult = await syncDepartments();

    // 2. Empleados
    const empResult = await syncEmployees();

    // 3. Calcular estadísticas post-sync
    const [[withName]] = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active' AND first_name != '' AND last_name != '' AND first_name IS NOT NULL AND last_name IS NOT NULL"
    ).catch(() => [[{ cnt: null }]]);

    const [[blankName]] = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active' AND (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '')"
    ).catch(() => [[{ cnt: null }]]);

    const [[withDept]] = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM employees e JOIN departments d ON e.department_id = d.id WHERE e.status = 'active' AND d.name != 'This Company'"
    ).catch(() => [[{ cnt: null }]]);

    const [[noDept]] = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.status = 'active' AND (d.id IS NULL OR d.name = 'This Company' OR d.name IS NULL)"
    ).catch(() => [[{ cnt: null }]]);

    // 4. Registrar timestamp de sincronización en settings
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await sequelize.query(
      "INSERT INTO settings (`key`, `value`) VALUES ('userinfo_last_sync_at', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
      { replacements: [now] }
    ).catch(() => {});

    res.json({
      ok: true,
      departments: deptResult,
      employees: empResult,
      after_sync: {
        employees_with_name:          withName?.cnt  ?? null,
        employees_blank_name:         blankName?.cnt ?? null,
        employees_with_department:    withDept?.cnt  ?? null,
        employees_without_department: noDept?.cnt    ?? null,
      },
      synced_at: now,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/attendance — Importar marcajes ───────────────
// Body: { dateFrom: "2026-04-01", dateTo: "2026-04-11", limit: 10000, conn? }
router.post('/attendance', async (req, res) => {
  const { dateFrom, dateTo, limit = 10000, conn } = req.body;
  if (conn) {
    resetPool();
    if (conn.host     !== undefined) process.env.ATT_HOST     = conn.host;
    if (conn.port     !== undefined) process.env.ATT_PORT     = String(conn.port);
    if (conn.database !== undefined) process.env.ATT_DATABASE = conn.database;
    if (conn.user     !== undefined) process.env.ATT_USER     = conn.user;
    if (conn.password !== undefined) process.env.ATT_PASSWORD = conn.password;
  }
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

// ─── POST /api/sync/devices — Sincronizar relojes desde ZKTECO_DEVICES ──────
// Lee la variable de entorno ZKTECO_DEVICES (formato "IP:PUERTO,IP:PUERTO,...")
// y hace upsert en la tabla devices.  Idempotente — seguro de re-ejecutar.
router.post('/devices', async (req, res) => {
  const envStr = (process.env.ZKTECO_DEVICES || '').trim();
  if (!envStr) {
    return res.status(400).json({
      ok: false,
      error: 'ZKTECO_DEVICES no está configurado en las variables de entorno',
    });
  }

  // Parsear "IP[:PUERTO], ..." — puerto por defecto 4370
  const entries = envStr.split(',').map(s => s.trim()).filter(Boolean);
  const parsed = entries.map((entry, i) => {
    const colonIdx = entry.lastIndexOf(':');
    let ip = entry, port = 4370;
    if (colonIdx > 0) {
      ip   = entry.slice(0, colonIdx).trim();
      port = parseInt(entry.slice(colonIdx + 1)) || 4370;
    }
    return { name: `Reloj ZKTeco ${i + 1}`, ip_address: ip, port, source: 'env' };
  });

  const invalid = parsed.filter(d => !d.ip_address || !/^[a-zA-Z0-9._-]+$/.test(d.ip_address));
  if (invalid.length) {
    return res.status(400).json({
      ok: false,
      error: `Entradas inválidas en ZKTECO_DEVICES: ${invalid.map(d => d.ip_address).join(', ')}`,
    });
  }

  let upserted = 0, errors = 0;
  const errList = [];
  for (const d of parsed) {
    try {
      await sequelize.query(`
        INSERT INTO devices (name, ip_address, port, source, status)
        VALUES (?, ?, ?, 'env', 'offline')
        ON DUPLICATE KEY UPDATE
          port      = VALUES(port),
          source    = 'env',
          name      = IF(source = 'env' OR name = '', VALUES(name), name)
      `, { replacements: [d.name, d.ip_address, d.port] });
      upserted++;
    } catch (e) {
      errors++;
      errList.push({ ip: d.ip_address, error: e.message });
    }
  }

  const [[dbCount]] = await sequelize.query(
    'SELECT COUNT(*) AS cnt FROM devices'
  ).catch(() => [[{ cnt: null }]]);

  res.json({
    ok:             errors === 0,
    from_env:       parsed.length,
    upserted,
    errors,
    ...(errList.length ? { error_list: errList } : {}),
    devices_in_db:  dbCount?.cnt ?? null,
    devices:        parsed,
  });
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

// ─── POST /api/sync/push-to-att2000 ──────────────────────────────
// Envía marcaciones del MySQL local → att2000.CHECKINOUT
// Body: { dateFrom?, dateTo?, limit? }
// Útil para sincronizar marcaciones manuales ingresadas en SisHoras
// o para re-enviar registros que att2000 no capturó.
router.post('/push-to-att2000', async (req, res) => {
  const { dateFrom, dateTo, limit = 5000 } = req.body;

  let where = '1=1';
  const replacements = [];
  if (dateFrom) { where += ' AND al.timestamp >= ?'; replacements.push(dateFrom); }
  if (dateTo)   { where += ' AND al.timestamp <= ?'; replacements.push(dateTo + ' 23:59:59'); }

  try {
    // Leer del MySQL local — solo registros con código de empleado válido
    const [rows] = await sequelize.query(`
      SELECT
        al.id,
        al.timestamp,
        al.type,
        al.source,
        e.code AS employee_code,
        d.id   AS device_sensor_id
      FROM attendance_logs al
      JOIN employees e ON e.id = al.employee_id
      LEFT JOIN devices d ON d.id = al.device_id
      WHERE ${where}
      ORDER BY al.timestamp DESC
      LIMIT ?
    `, { replacements: [...replacements, limit] });

    if (!rows.length) {
      return res.json({ ok: true, message: 'No hay registros para enviar', total: 0, inserted: 0, skipped: 0 });
    }

    // Enviar a att2000
    const result = await writeCheckinOut(rows);

    res.json({
      ok: true,
      total: rows.length,
      inserted: result.inserted,
      skipped:  result.skipped,
      errors:   result.errors,
      errList:  result.errList?.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sync/push-to-att2000/preview ───────────────────────
// Vista previa: cuántos registros se enviarían a att2000
router.get('/push-to-att2000/preview', async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  let where = '1=1';
  const replacements = [];
  if (dateFrom) { where += ' AND al.timestamp >= ?'; replacements.push(dateFrom); }
  if (dateTo)   { where += ' AND al.timestamp <= ?'; replacements.push(dateTo + ' 23:59:59'); }

  try {
    const [[count]] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM attendance_logs al
       JOIN employees e ON e.id = al.employee_id
       WHERE ${where}`,
      { replacements }
    );
    res.json({ ok: true, total: count.total, dateFrom, dateTo });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/sync/reconcile — ejecutar reconciliación manual (default: ayer)
router.post('/reconcile', async (req, res) => {
  try {
    const { runReconciliation } = require('../services/reconciliation');
    const { date } = req.body || {};
    const result = await runReconciliation(date);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/sync/reconcile/history — últimos 30 reportes
router.get('/reconcile/history', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT * FROM reconciliation_report
      ORDER BY report_date DESC LIMIT 30
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ENDPOINTS NUEVOS — Migración estructurada att2000 (Backlog Sprint 1+2)
// ═══════════════════════════════════════════════════════════════════

// ─── GET /api/sync/att2000/diagnose ──────────────────────────────
router.get('/att2000/diagnose', async (req, res) => {
  try {
    const { getAtt2000, queryAtt2000 } = require('../config/att2000');
    await getAtt2000();

    const checks = await Promise.allSettled([
      queryAtt2000('SELECT COUNT(*) AS cnt FROM CHECKINOUT'),
      queryAtt2000('SELECT COUNT(*) AS cnt FROM USERINFO'),
      queryAtt2000('SELECT COUNT(*) AS cnt FROM DEPARTMENTS').catch(() => [{ cnt: 0 }]),
      queryAtt2000('SELECT MIN(CHECKTIME) AS min_dt, MAX(CHECKTIME) AS max_dt FROM CHECKINOUT'),
      queryAtt2000(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_CATALOG = '${process.env.ATT_DATABASE || 'att2000'}'`),
    ]);

    const punches    = checks[0].status === 'fulfilled' ? checks[0].value[0]?.cnt : null;
    const users      = checks[1].status === 'fulfilled' ? checks[1].value[0]?.cnt : null;
    const depts      = checks[2].status === 'fulfilled' ? checks[2].value[0]?.cnt : null;
    const range      = checks[3].status === 'fulfilled' ? checks[3].value[0] : null;
    const tables     = checks[4].status === 'fulfilled' ? checks[4].value.map(r => r.TABLE_NAME) : [];

    const issues = [];
    if (punches === null) issues.push('No se pudo leer CHECKINOUT');
    if (users   === null) issues.push('No se pudo leer USERINFO');

    res.json({
      connected:       true,
      database:        process.env.ATT_DATABASE || 'att2000',
      host:            process.env.ATT_HOST || '',
      tables_detected: tables,
      users_count:     users,
      punches_count:   punches,
      departments_count: depts,
      min_checktime:   range?.min_dt,
      max_checktime:   range?.max_dt,
      issues,
    });
  } catch (err) {
    res.status(503).json({ connected: false, error: err.message });
  }
});

// ─── GET /api/sync/att2000/schema ────────────────────────────────
router.get('/att2000/schema', async (req, res) => {
  try {
    const { queryAtt2000 } = require('../config/att2000');
    const rows = await queryAtt2000(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_CATALOG = '${process.env.ATT_DATABASE || 'att2000'}'
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);
    const byTable = {};
    for (const r of rows) {
      if (!byTable[r.TABLE_NAME]) byTable[r.TABLE_NAME] = [];
      byTable[r.TABLE_NAME].push({ column: r.COLUMN_NAME, type: r.DATA_TYPE, nullable: r.IS_NULLABLE === 'YES' });
    }
    res.json({ ok: true, schema: byTable, table_count: Object.keys(byTable).length });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sync/att2000/counts ────────────────────────────────
router.get('/att2000/counts', async (req, res) => {
  try {
    const { queryAtt2000 } = require('../config/att2000');
    const tables = ['CHECKINOUT','USERINFO','DEPARTMENTS'];
    const results = {};
    for (const t of tables) {
      try {
        const r = await queryAtt2000(`SELECT COUNT(*) AS cnt FROM ${t}`);
        results[t] = r[0]?.cnt ?? 0;
      } catch {
        results[t] = null;
      }
    }
    res.json({ ok: true, counts: results });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sync/att2000/source-mode ───────────────────────────
router.get('/att2000/source-mode', async (req, res) => {
  try {
    const [[row]] = await sequelize.query(
      "SELECT `value` FROM settings WHERE `key` = 'attendance.source_mode'"
    );
    res.json({ source_mode: row?.value || 'legacy_att2000' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/sync/att2000/source-mode ───────────────────────────
router.put('/att2000/source-mode', async (req, res) => {
  const { mode } = req.body;
  if (!['legacy_att2000','hybrid','direct_only'].includes(mode)) {
    return res.status(400).json({ error: 'mode inválido: legacy_att2000 | hybrid | direct_only' });
  }
  try {
    await sequelize.query(
      "UPDATE settings SET `value` = ? WHERE `key` = 'attendance.source_mode'",
      { replacements: [mode] }
    );
    res.json({ ok: true, source_mode: mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/sync-runs ─────────────────────────────
router.get('/att2000/sync-runs', async (req, res) => {
  try {
    const { limit = 30, status } = req.query;
    let where = 'ss.code = ?';
    const params = ['att2000'];
    if (status) { where += ' AND sr.status = ?'; params.push(status); }
    const [rows] = await sequelize.query(`
      SELECT sr.*, ss.name AS source_name
      FROM source_sync_runs sr
      JOIN source_systems ss ON ss.id = sr.source_system_id
      WHERE ${where}
      ORDER BY sr.created_at DESC
      LIMIT ${parseInt(limit)}
    `, { replacements: params });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/employee-map ──────────────────────────
router.get('/att2000/employee-map', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    let where = 'ss.code = ?';
    const params = ['att2000'];
    if (status) { where += ' AND em.match_status = ?'; params.push(status); }
    const [rows] = await sequelize.query(`
      SELECT em.*, e.first_name, e.last_name, e.code AS employee_code
      FROM source_employee_map em
      JOIN source_systems ss ON ss.id = em.source_system_id
      LEFT JOIN employees e ON e.id = em.employee_id
      WHERE ${where}
      ORDER BY em.match_status, em.raw_name
      LIMIT ${parseInt(limit)}
    `, { replacements: params });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/sync/att2000/employee-map/:id ───────────────────────
router.put('/att2000/employee-map/:id', async (req, res) => {
  const { employee_id, match_status, notes } = req.body;
  try {
    await sequelize.query(`
      UPDATE source_employee_map
      SET employee_id = ?, match_status = ?, notes = ?, updated_at = NOW()
      WHERE id = ?
    `, { replacements: [employee_id || null, match_status || 'matched', notes || null, req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/import-employees ─────────────────────
router.post('/att2000/import-employees', async (req, res) => {
  try {
    const { queryAtt2000, getTableColumns, pickCol } = require('../config/att2000');
    const logger = require('../config/logger');

    // source_systems puede no existir si las migraciones avanzadas no se aplicaron.
    // En ese caso usamos syncEmployees() directamente.
    let sourceId = null;
    try {
      const [[src]] = await sequelize.query("SELECT id FROM source_systems WHERE code = 'att2000'");
      sourceId = src?.id || null;
    } catch {
      sourceId = null;
    }

    if (!sourceId) {
      // Fallback: sincronización directa sin tablas de trazabilidad
      const result = await syncEmployees();
      return res.json({
        ok: true, mode: 'direct_sync',
        total: result.total, matched: result.synced, errors: result.errors,
        note: 'source_systems no disponible — se usó syncEmployees() directo',
      });
    }

    const [runRes] = await sequelize.query(`
      INSERT INTO source_sync_runs (source_system_id, sync_type, entity_type, status, started_at)
      VALUES (?, 'full', 'users', 'running', NOW())
    `, { replacements: [sourceId] });
    const runId = runRes;

    const cols = await getTableColumns('USERINFO');
    const badgeCol  = pickCol(cols, 'BADGENUMBER', { prefix: 'u.' });
    const nameCol   = pickCol(cols, 'Name',         { prefix: 'u.', alias: 'raw_name' });
    const deptCol   = pickCol(cols, 'DEFAULTDEPTID',{ prefix: 'u.', alias: 'dept_id' });

    const users = await queryAtt2000(`SELECT u.USERID AS source_user_id, ${badgeCol}, ${nameCol}, ${deptCol} FROM USERINFO u`);

    let inserted = 0, updated = 0, errors = 0;

    for (const u of users) {
      try {
        const badge = String(u.BADGENUMBER || u.source_user_id).trim();

        // Buscar empleado existente por código
        const [[emp]] = await sequelize.query(
          'SELECT id FROM employees WHERE code = ? LIMIT 1',
          { replacements: [badge] }
        );

        const employeeId = emp?.id || null;
        const matchStatus = employeeId ? 'matched' : 'unmatched';

        // Upsert source_employee_map
        await sequelize.query(`
          INSERT INTO source_employee_map
            (source_system_id, source_user_id, source_badge_number, employee_id, raw_name, match_status, match_confidence)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            source_badge_number = VALUES(source_badge_number),
            employee_id = COALESCE(VALUES(employee_id), employee_id),
            raw_name = VALUES(raw_name),
            match_status = IF(employee_id IS NOT NULL, 'matched', VALUES(match_status)),
            match_confidence = IF(employee_id IS NOT NULL, 100, 0),
            updated_at = NOW()
        `, { replacements: [sourceId, String(u.source_user_id), badge, employeeId, u.raw_name || null, matchStatus, employeeId ? 100 : 0] });

        if (employeeId) updated++; else inserted++;
      } catch (e) {
        errors++;
        logger.error('import-employees row error:', e.message);
      }
    }

    await sequelize.query(`
      UPDATE source_sync_runs SET status='completed', finished_at=NOW(),
        total_read=?, total_inserted=?, total_updated=?, total_errors=?
      WHERE id=?
    `, { replacements: [users.length, inserted, updated, errors, runId] });

    res.json({ ok: true, total: users.length, matched: updated, unmatched: inserted, errors, run_id: runId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/sync/att2000/import-punches ───────────────────────
// Body: { from, to, batch_size?, mode? }
router.post('/att2000/import-punches', async (req, res) => {
  const { from, to, batch_size = 5000, mode = 'staging_then_apply' } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from y to son requeridos (YYYY-MM-DD)' });

  try {
    const { queryAtt2000, getTableColumns, pickCol } = require('../config/att2000');
    const logger = require('../config/logger');

    const [[src]] = await sequelize.query("SELECT id FROM source_systems WHERE code = 'att2000'");
    const sourceId = src.id;
    const [runRes] = await sequelize.query(`
      INSERT INTO source_sync_runs
        (source_system_id, sync_type, entity_type, status, started_at, from_datetime, to_datetime, created_by)
      VALUES (?, 'full', 'punches', 'running', NOW(), ?, ?, ?)
    `, { replacements: [sourceId, from, to, req.user?.id || null] });
    const runId = runRes;

    const cols = await getTableColumns('CHECKINOUT');
    const workCode  = pickCol(cols, 'WorkCode',   { prefix: 'c.', alias: 'work_code' });
    const checkType = pickCol(cols, 'CHECKTYPE',  { prefix: 'c.', alias: 'check_type' });
    const sensorId  = pickCol(cols, 'SENSORID',   { prefix: 'c.', alias: 'sensor_id' });
    const verifyCode= pickCol(cols, 'VERIFYCODE', { prefix: 'c.', alias: 'verify_code' });

    const punches = await queryAtt2000(`
      SELECT c.USERID AS source_user_id, c.CHECKTIME AS check_time,
             ${checkType}, ${sensorId}, ${verifyCode}, ${workCode}
      FROM CHECKINOUT c
      WHERE c.CHECKTIME >= '${from}' AND c.CHECKTIME <= '${to} 23:59:59'
      ORDER BY c.CHECKTIME
    `);

    let staged = 0, imported = 0, dupes = 0, errors = 0;

    // Cargar mapa de usuarios
    const [empMaps] = await sequelize.query(
      'SELECT source_user_id, employee_id FROM source_employee_map WHERE source_system_id = ?',
      { replacements: [sourceId] }
    );
    const empMap = {};
    for (const m of empMaps) empMap[String(m.source_user_id)] = m.employee_id;

    // Normalizar checktype
    const normalizeType = (ct) => {
      if (!ct) return 'unknown';
      const t = String(ct).toUpperCase();
      if (t === 'I' || t === '0') return 'in';
      if (t === 'O' || t === '1') return 'out';
      return 'unknown';
    };

    // Procesar en lotes
    for (let i = 0; i < punches.length; i += batch_size) {
      const batch = punches.slice(i, i + batch_size);
      for (const p of batch) {
        try {
          const empId = empMap[String(p.source_user_id)] || null;
          const normType = normalizeType(p.check_type);
          const rawData = JSON.stringify(p);

          await sequelize.query(`
            INSERT IGNORE INTO attendance_import_staging
              (sync_run_id, source_system_id, source_user_id, check_time, check_type,
               sensor_id, verify_code, work_code, raw_data, normalized_type, employee_id, import_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          `, { replacements: [
            runId, sourceId, String(p.source_user_id),
            p.check_time, p.check_type || null,
            p.sensor_id || null, p.verify_code || null, p.work_code || null,
            rawData, normType, empId
          ]});
          staged++;
        } catch (e) {
          if (e.message?.includes('Duplicate')) dupes++;
          else { errors++; }
        }
      }
    }

    // Aplicar staging → attendance_logs
    if (mode === 'staging_then_apply') {
      const [pending] = await sequelize.query(`
        SELECT * FROM attendance_import_staging
        WHERE sync_run_id = ? AND import_status = 'pending' AND employee_id IS NOT NULL
          AND normalized_type IN ('in','out')
      `, { replacements: [runId] });

      for (const s of pending) {
        try {
          // Verificar duplicado en attendance_logs
          const [[dup]] = await sequelize.query(`
            SELECT id FROM attendance_logs WHERE employee_id=? AND timestamp=? LIMIT 1
          `, { replacements: [s.employee_id, s.check_time] });

          if (dup) {
            await sequelize.query("UPDATE attendance_import_staging SET import_status='duplicate' WHERE id=?", { replacements: [s.id] });
            dupes++;
          } else {
            await sequelize.query(`
              INSERT INTO attendance_logs (employee_id, timestamp, type, source, source_system, raw_data, created_at)
              VALUES (?, ?, ?, 'att2000_import', 'att2000', ?, NOW())
            `, { replacements: [s.employee_id, s.check_time, s.normalized_type, s.raw_data] });
            await sequelize.query("UPDATE attendance_import_staging SET import_status='imported' WHERE id=?", { replacements: [s.id] });
            imported++;
          }
        } catch (e) {
          errors++;
          await sequelize.query("UPDATE attendance_import_staging SET import_status='error', error_message=? WHERE id=?",
            { replacements: [e.message, s.id] });
        }
      }
    }

    await sequelize.query(`
      UPDATE source_sync_runs SET status='completed', finished_at=NOW(),
        total_read=?, total_inserted=?, total_skipped=?, total_errors=?
      WHERE id=?
    `, { replacements: [punches.length, imported, dupes, errors, runId] });

    res.json({ ok: true, run_id: runId, total_read: punches.length, staged, imported, duplicates: dupes, errors });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sync/att2000/staging ───────────────────────────────
router.get('/att2000/staging', async (req, res) => {
  try {
    const { run_id, status, limit = 100 } = req.query;
    let where = '1=1';
    const params = [];
    if (run_id) { where += ' AND sync_run_id = ?'; params.push(run_id); }
    if (status) { where += ' AND import_status = ?'; params.push(status); }
    const [rows] = await sequelize.query(`
      SELECT s.*, e.first_name, e.last_name, e.code AS employee_code
      FROM attendance_import_staging s
      LEFT JOIN employees e ON e.id = s.employee_id
      WHERE ${where}
      ORDER BY s.check_time DESC
      LIMIT ${parseInt(limit)}
    `, { replacements: params });
    const [[total]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM attendance_import_staging WHERE ${where}`, { replacements: params });
    res.json({ data: rows, total: total.cnt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/reconcile-advanced ───────────────────
router.post('/att2000/reconcile-advanced', async (req, res) => {
  const { date_from, date_to, employee_id } = req.body;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from y date_to requeridos' });

  try {
    const { queryAtt2000 } = require('../config/att2000');
    const [[src]] = await sequelize.query("SELECT id FROM source_systems WHERE code = 'att2000'");
    const sourceId = src.id;
    const [runRes] = await sequelize.query(`
      INSERT INTO source_sync_runs
        (source_system_id, sync_type, entity_type, status, started_at, from_datetime, to_datetime)
      VALUES (?, 'reconciliation', 'punches', 'running', NOW(), ?, ?)
    `, { replacements: [sourceId, date_from, date_to] });
    const runId = runRes;

    let empFilter = '';
    const params = [date_from, date_to + ' 23:59:59'];
    if (employee_id) { empFilter = ' AND al.employee_id = ?'; params.push(employee_id); }

    // Conteo local por empleado/día
    const [localCounts] = await sequelize.query(`
      SELECT DATE(al.timestamp) AS d, al.employee_id, COUNT(*) AS cnt
      FROM attendance_logs al
      WHERE al.timestamp BETWEEN ? AND ?${empFilter}
      GROUP BY DATE(al.timestamp), al.employee_id
    `, { replacements: params });

    // Conteo en att2000 por usuario/día
    const sourceCounts = await queryAtt2000(`
      SELECT CAST(CHECKTIME AS DATE) AS d, USERID AS source_user_id, COUNT(*) AS cnt
      FROM CHECKINOUT
      WHERE CHECKTIME >= '${date_from}' AND CHECKTIME <= '${date_to} 23:59:59'
      GROUP BY CAST(CHECKTIME AS DATE), USERID
    `);

    // Mapear source_user_id → employee_id
    const [empMaps] = await sequelize.query(
      'SELECT source_user_id, employee_id FROM source_employee_map WHERE source_system_id = ?',
      { replacements: [sourceId] }
    );
    const sourceToEmp = {};
    for (const m of empMaps) if (m.employee_id) sourceToEmp[String(m.source_user_id)] = m.employee_id;

    // Construir índice local
    const localIdx = {};
    for (const r of localCounts) localIdx[`${r.d}_${r.employee_id}`] = r.cnt;

    let issues = 0;
    for (const s of sourceCounts) {
      const empId = sourceToEmp[String(s.source_user_id)];
      if (!empId) continue;
      const key = `${s.d}_${empId}`;
      const localCnt = localIdx[key] || 0;
      if (localCnt !== s.cnt) {
        await sequelize.query(`
          INSERT INTO attendance_reconciliation_results
            (sync_run_id, employee_id, date, issue_type, source_count, local_count, details_json)
          VALUES (?, ?, ?, 'time_mismatch', ?, ?, ?)
        `, { replacements: [
          runId, empId, s.d,
          s.cnt, localCnt,
          JSON.stringify({ source_user_id: s.source_user_id })
        ]});
        issues++;
      }
    }

    await sequelize.query(`
      UPDATE source_sync_runs SET status='completed', finished_at=NOW(), total_errors=? WHERE id=?
    `, { replacements: [issues, runId] });

    res.json({ ok: true, run_id: runId, issues_found: issues, date_from, date_to });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sync/att2000/reconcile-results ─────────────────────
router.get('/att2000/reconcile-results', async (req, res) => {
  try {
    const { status = 'open', limit = 100 } = req.query;
    const [rows] = await sequelize.query(`
      SELECT r.*, e.first_name, e.last_name, e.code AS employee_code,
             sr.created_at AS run_date
      FROM attendance_reconciliation_results r
      LEFT JOIN employees e ON e.id = r.employee_id
      JOIN source_sync_runs sr ON sr.id = r.sync_run_id
      WHERE r.status = ?
      ORDER BY r.date DESC, r.created_at DESC
      LIMIT ${parseInt(limit)}
    `, { replacements: [status] });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
