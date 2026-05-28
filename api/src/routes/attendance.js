const router = require('express').Router();
const { authenticate, authorize, authenticateServiceKey } = require('../middleware/auth');
const {
  getDashboardStats, getByDate, registerManual, registerMobile,
  bridgeWebhook
} = require('../controllers/attendanceController');

// Endpoint para el Bridge ZKTeco (clave interna, sin JWT)
router.post('/bridge/webhook', authenticateServiceKey, bridgeWebhook);

router.use(authenticate);

router.get('/live',  getDashboardStats);   // estado actual del día — KPIs + últimos marcajes
router.get('/',                getByDate);            // ?date=&dept=&employeeId=
router.post('/manual',         authorize('admin','hr'), registerManual);
router.post('/mobile',         registerMobile);       // marcaje desde app

// Recalcular daily_summary en bloque para una fecha (admin)
router.post('/recalc-summary', authorize('admin','super_admin'), async (req, res) => {
  try {
    const { bulkRecalcDailySummary, pyDateStr } = require('../services/scheduler');
    const date = req.body.date || pyDateStr(new Date());
    await bulkRecalcDailySummary(date);
    res.json({ ok: true, date, message: `daily_summary recalculado para ${date}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Orquestador compartido: importar att2000 + recalcular daily_summary ──────
async function _runImportAndRecalc({ date_from, date_to }) {
  const { syncAttendance }  = require('../config/zkAdapter');
  const { bulkRecalcDailySummary, pyDateStr } = require('../services/scheduler');
  const { sequelize } = require('../config/database');
  const logger = require('../config/logger');

  // 1. Importar att2000 → attendance_logs (INSERT IGNORE, idempotente)
  let raw = { imported: 0, skipped: 0, notFound: 0, total: 0 };
  try {
    raw = await syncAttendance({ dateFrom: date_from, dateTo: date_to });
  } catch (importErr) {
    const err = new Error(`att2000 no disponible: ${importErr.message}`);
    err.status = 502;
    throw err;
  }

  logger.info('import-att2000', {
    date_from, date_to,
    source_total: raw.total,
    inserted: raw.imported,
    skipped_duplicates: raw.skipped,
    not_found_employees: raw.notFound,
  });

  // 2. Contar cuántos registros existen ya en attendance_logs para el rango
  let localExisting = 0;
  try {
    const [[row]] = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM attendance_logs WHERE DATE(timestamp) BETWEEN ? AND ?",
      { replacements: [date_from, date_to] }
    );
    localExisting = row?.cnt || 0;
  } catch {}

  // 3. Recalcular daily_summary para cada fecha del rango
  const dtFrom = new Date(date_from + 'T00:00:00');
  const dtTo   = new Date(date_to   + 'T00:00:00');
  const dates = [];
  const cur = new Date(dtFrom);
  while (cur <= dtTo) {
    dates.push(pyDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const recalcErrors = [];
  for (const d of dates) {
    try { await bulkRecalcDailySummary(d); }
    catch (e) { recalcErrors.push({ date: d, error: e.message }); }
  }

  const result = {
    ok: true,
    date_from,
    date_to,
    source: 'att2000',
    source_total:          raw.total,
    local_existing:        localExisting,
    inserted:              raw.imported,
    skipped_duplicates:    raw.skipped,
    not_found_employees:   raw.notFound,
    recalculated_days:     dates,
  };

  if (raw.total === 0) {
    result.warning = 'No se encontraron marcaciones en att2000 para el rango solicitado. Verifique fecha y conexión.';
  } else if (raw.imported === 0 && raw.skipped > 0) {
    result.message = 'Importación finalizada: los datos ya estaban sincronizados';
  } else {
    result.message = `${raw.imported} nuevas marcaciones importadas, ${dates.length} día(s) recalculado(s)`;
  }

  if (recalcErrors.length > 0) result.recalc_errors = recalcErrors;

  return result;
}

// ─── POST /api/attendance/import-att2000 ─────────────────────────────────────
// Importa marcaciones de att2000 hacia attendance_logs y recalcula daily_summary.
// Accesible a admin y hr (sin requerir super_admin como /api/sync/).
// Body: { date_from: "YYYY-MM-DD", date_to: "YYYY-MM-DD" }
router.post('/import-att2000', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { date_from, date_to } = req.body;
  if (!date_from || !date_to) {
    return res.status(400).json({ ok: false, error: 'date_from y date_to son requeridos (YYYY-MM-DD)' });
  }
  const dtFrom = new Date(date_from + 'T00:00:00');
  const dtTo   = new Date(date_to   + 'T00:00:00');
  if (isNaN(dtFrom) || isNaN(dtTo) || dtFrom > dtTo) {
    return res.status(400).json({ ok: false, error: 'Rango de fechas inválido' });
  }
  if (Math.round((dtTo - dtFrom) / 86400000) > 31) {
    return res.status(400).json({ ok: false, error: 'El rango no puede superar 31 días por ejecución' });
  }
  try {
    res.json(await _runImportAndRecalc({ date_from, date_to }));
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/attendance/reprocess-range (alias de import-att2000) ───────────
router.post('/reprocess-range', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { date_from, date_to } = req.body;
  if (!date_from || !date_to) {
    return res.status(400).json({ ok: false, error: 'date_from y date_to son requeridos (YYYY-MM-DD)' });
  }
  const dtFrom = new Date(date_from + 'T00:00:00');
  const dtTo   = new Date(date_to   + 'T00:00:00');
  if (isNaN(dtFrom) || isNaN(dtTo) || dtFrom > dtTo) {
    return res.status(400).json({ ok: false, error: 'Rango de fechas inválido' });
  }
  if (Math.round((dtTo - dtFrom) / 86400000) > 31) {
    return res.status(400).json({ ok: false, error: 'El rango no puede superar 31 días por ejecución' });
  }
  try {
    const result = await _runImportAndRecalc({ date_from, date_to });
    res.json({ ...result, days_processed: result.recalculated_days.length });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/attendance/process-day (alias de recalc-summary) ──────────────
router.post('/process-day', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  try {
    const { bulkRecalcDailySummary, pyDateStr } = require('../services/scheduler');
    const date = req.body.date || pyDateStr(new Date());
    await bulkRecalcDailySummary(date);
    res.json({ ok: true, date, processed: true, message: `daily_summary recalculado para ${date}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/attendance/recalc-range ───────────────────────────────────────
// Recalcula daily_summary para un rango de fechas sin reimportar desde att2000.
// Útil cuando los logs ya están en attendance_logs pero el procesamiento falló.
// Body: { date_from: "YYYY-MM-DD", date_to: "YYYY-MM-DD" }
router.post('/recalc-range', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { date_from, date_to } = req.body;
  if (!date_from || !date_to) {
    return res.status(400).json({ ok: false, error: 'date_from y date_to son requeridos (YYYY-MM-DD)' });
  }
  const dtFrom = new Date(date_from + 'T00:00:00');
  const dtTo   = new Date(date_to   + 'T00:00:00');
  if (isNaN(dtFrom) || isNaN(dtTo) || dtFrom > dtTo) {
    return res.status(400).json({ ok: false, error: 'Rango de fechas inválido' });
  }
  if (Math.round((dtTo - dtFrom) / 86400000) > 31) {
    return res.status(400).json({ ok: false, error: 'El rango no puede superar 31 días' });
  }

  try {
    const { bulkRecalcDailySummary, pyDateStr } = require('../services/scheduler');
    const dates = [];
    const cur = new Date(dtFrom);
    while (cur <= dtTo) {
      dates.push(pyDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const results = [];
    for (const d of dates) {
      try {
        await bulkRecalcDailySummary(d);
        results.push({ date: d, ok: true });
      } catch (e) {
        results.push({ date: d, ok: false, error: e.message });
      }
    }

    const errors = results.filter(r => !r.ok);
    res.json({
      ok: errors.length === 0,
      date_from,
      date_to,
      dates_processed: results.length,
      dates_ok: results.length - errors.length,
      errors,
      results,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/attendance/reconciliation-diagnostics?date=YYYY-MM-DD ──────────
// Diagnóstico completo de la cadena de marcaciones: att2000 → local → daily_summary.
// Ayuda a identificar por qué empleados aparecen como "ausentes" sin datos.
router.get('/reconciliation-diagnostics', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { sequelize } = require('../config/database');
  const date = req.query.date || new Date().toISOString().split('T')[0];

  // Helper: query local MySQL con fallback silencioso
  const qLocal = async (sql, repl) => {
    try {
      const [rows] = await sequelize.query(sql, repl ? { replacements: repl } : undefined);
      return rows;
    } catch { return []; }
  };
  const qLocalOne = async (sql, repl) => {
    const r = await qLocal(sql, repl);
    return r[0] || null;
  };

  // Helper: query att2000 SQL Server con fallback silencioso
  const qAtt = async (sql) => {
    try {
      const { queryAtt2000 } = require('../config/att2000');
      return await queryAtt2000(sql);
    } catch { return null; }
  };

  // ── 1. att2000 ───────────────────────────────────────────────────
  const [attTotal, attToday, attLastEvent, attUsers] = await Promise.all([
    qAtt('SELECT COUNT(*) AS cnt FROM CHECKINOUT'),
    qAtt(`SELECT COUNT(*) AS cnt FROM CHECKINOUT WHERE CONVERT(date, CHECKTIME) = '${date}'`),
    qAtt('SELECT TOP 1 CHECKTIME AS ts, USERID FROM CHECKINOUT ORDER BY CHECKTIME DESC'),
    qAtt('SELECT COUNT(*) AS cnt FROM USERINFO'),
  ]);
  const att2000Available = attTotal !== null;
  const attLastEventAt = att2000Available ? (attLastEvent?.[0]?.ts ?? null) : null;

  // ── 2. Bridge ZKTeco ────────────────────────────────────────────
  // Devices come from BOTH the DB `devices` table AND ZKTECO_DEVICES env var (ip:port CSV)
  let bridgeDevicesDetected = 0;
  let bridgeLastPoll = null;
  try {
    const [devRows] = await sequelize.query(
      'SELECT COUNT(*) AS cnt, MAX(last_sync_at) AS last_sync FROM devices'
    );
    bridgeDevicesDetected = devRows[0]?.cnt || 0;
    bridgeLastPoll        = devRows[0]?.last_sync || null;
  } catch {}
  const envDevicesStr = process.env.ZKTECO_DEVICES || '';
  const bridgeDevicesExpected = envDevicesStr
    ? envDevicesStr.split(',').filter(s => s.trim()).length
    : 0;
  const totalDevices = Math.max(bridgeDevicesDetected, bridgeDevicesExpected);

  const rawTodayRow = await qLocalOne(
    'SELECT COUNT(*) AS cnt FROM attendance_logs WHERE DATE(timestamp) = ? AND source = ?',
    [date, 'device']
  );
  const rawToday = rawTodayRow?.cnt || 0;

  // ── 3. attendance_logs (fuente local unificada) ──────────────────
  const logTotalRow  = await qLocalOne('SELECT COUNT(*) AS cnt FROM attendance_logs', null);
  const logTodayRow  = await qLocalOne(
    'SELECT COUNT(*) AS cnt FROM attendance_logs WHERE DATE(timestamp) = ?', [date]
  );
  const lastRawRow = await qLocalOne(
    'SELECT MAX(timestamp) AS ts FROM attendance_logs', null
  );
  const lastRawEventAt = lastRawRow?.ts ?? null;

  const latestRaw = await qLocal(
    `SELECT al.id, al.employee_id, al.timestamp, al.type, al.source,
            CONCAT(e.first_name,' ',e.last_name) AS employee_name
     FROM attendance_logs al
     LEFT JOIN employees e ON e.id = al.employee_id
     ORDER BY al.timestamp DESC LIMIT 10`, null
  );

  // ── 4. daily_summary (procesado) ────────────────────────────────
  const dsTodayRow = await qLocalOne(
    'SELECT COUNT(*) AS cnt FROM daily_summary WHERE date = ?', [date]
  );
  const lastProcessedRow = await qLocalOne(
    'SELECT MAX(date) AS dt FROM daily_summary', null
  );
  const lastProcessedEventAt = lastProcessedRow?.dt ?? null;

  const latestProcessed = await qLocal(
    `SELECT ds.employee_id, ds.date, ds.first_in, ds.last_out,
            ds.worked_minutes, ds.late_minutes, ds.status,
            CONCAT(e.first_name,' ',e.last_name) AS employee_name
     FROM daily_summary ds
     LEFT JOIN employees e ON e.id = ds.employee_id
     WHERE ds.date = ?
     ORDER BY ds.status, e.last_name
     LIMIT 10`, [date]
  );

  // ── 5. Mapeo de empleados ────────────────────────────────────────
  const empTotalRow   = await qLocalOne('SELECT COUNT(*) AS cnt FROM employees WHERE status = ?', ['active']);
  const empWithCode   = await qLocalOne(
    "SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active' AND code IS NOT NULL AND code != ''"
  );
  const empNoCode     = await qLocalOne(
    "SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active' AND (code IS NULL OR code = '')"
  );

  // Empleados activos sin ninguna marcación HOY en daily_summary
  const absentToday = await qLocalOne(
    `SELECT COUNT(*) AS cnt FROM employees e
     LEFT JOIN daily_summary ds ON ds.employee_id = e.id AND ds.date = ?
     WHERE e.status = 'active' AND (ds.id IS NULL OR ds.status = 'absent')`, [date]
  );

  // ── 6. Anomalías en daily_summary para la fecha ─────────────────
  const [anomalyOnlyIn, anomalyOnlyOut, anomalyOutBeforeIn, anomalyDeptGeneric, anomalyNoName] = await Promise.all([
    qLocalOne(`SELECT COUNT(*) AS cnt FROM daily_summary WHERE date = ? AND first_in IS NOT NULL AND last_out IS NULL`, [date]),
    qLocalOne(`SELECT COUNT(*) AS cnt FROM daily_summary WHERE date = ? AND first_in IS NULL AND last_out IS NOT NULL`, [date]),
    qLocalOne(`SELECT COUNT(*) AS cnt FROM daily_summary ds WHERE date = ? AND first_in IS NOT NULL AND last_out IS NOT NULL AND last_out < first_in`, [date]),
    qLocalOne(`SELECT COUNT(*) AS cnt FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.status = 'active' AND (d.id IS NULL OR d.name = 'This Company' OR d.name IS NULL)`, null),
    qLocalOne(`SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active' AND (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '')`, null),
  ]);

  // ── 7. Sin mapeo (unmapped punches) ─────────────────────────────
  const unmatchedRows = await qLocal(
    'SELECT source_user_id, badge_number, check_time FROM unknown_attendance_events ORDER BY check_time DESC LIMIT 5',
    null
  );
  const unmatchedCount = await qLocalOne('SELECT COUNT(*) AS cnt FROM unknown_attendance_events', null);

  // ── 8. Duplicados en attendance_logs para la fecha ────────────────
  const dupCountRow = await qLocalOne(
    `SELECT COUNT(*) AS cnt FROM (
       SELECT employee_id, \`timestamp\`
       FROM attendance_logs
       WHERE DATE(\`timestamp\`) = ?
       GROUP BY employee_id, \`timestamp\`
       HAVING COUNT(*) > 1
     ) sub`, [date]
  );
  const dupCount = dupCountRow?.cnt || 0;
  const dupSamples = dupCount > 0 ? await qLocal(
    `SELECT employee_id, \`timestamp\`, COUNT(*) AS copies
     FROM attendance_logs
     WHERE DATE(\`timestamp\`) = ?
     GROUP BY employee_id, \`timestamp\`
     HAVING COUNT(*) > 1
     ORDER BY copies DESC
     LIMIT 10`, [date]
  ) : [];

  // ── 7. Fuente con más marcaciones HOY ───────────────────────────
  const sourceBreakdown = await qLocal(
    'SELECT source, COUNT(*) AS cnt FROM attendance_logs WHERE DATE(timestamp) = ? GROUP BY source', [date]
  );

  // ── 8. Lag de sincronización ─────────────────────────────────────
  let syncLagHours = null;
  if (lastRawEventAt) {
    syncLagHours = Math.round((Date.now() - new Date(lastRawEventAt).getTime()) / 36e5 * 10) / 10;
  }

  // ── 9. Warnings ──────────────────────────────────────────────────
  const warnings = [];
  const activeEmployees = empTotalRow?.cnt || 0;
  const todayLogs = logTodayRow?.cnt || 0;
  if (att2000Available && attLastEventAt && new Date(attLastEventAt).toISOString().split('T')[0] < date) {
    warnings.push(`att2000: último evento fue ${attLastEventAt} — sin marcaciones para ${date}`);
  }
  if (activeEmployees > 0 && todayLogs === 0) {
    warnings.push(`Sin marcaciones locales hoy (${date}) con ${activeEmployees} empleados activos`);
  }
  if (activeEmployees > 0 && (dsTodayRow?.cnt || 0) === 0) {
    warnings.push(`daily_summary vacío para ${date} — ejecutar POST /api/attendance/recalc-summary`);
  }
  if (bridgeDevicesExpected > 0 && bridgeDevicesDetected === 0) {
    warnings.push(`Bridge: ${bridgeDevicesExpected} dispositivos en ENV pero 0 detectados en BD (tabla devices vacía)`);
  }
  if (syncLagHours !== null && syncLagHours > 24) {
    warnings.push(`Sin marcaciones nuevas hace ${syncLagHours}h — verificar bridge y sync att2000`);
  }
  const cntOnlyIn     = anomalyOnlyIn?.cnt    || 0;
  const cntOnlyOut    = anomalyOnlyOut?.cnt   || 0;
  const cntOutBefore  = anomalyOutBeforeIn?.cnt || 0;
  const cntNoName     = anomalyNoName?.cnt    || 0;
  const cntNoDept     = anomalyDeptGeneric?.cnt || 0;
  if (cntOutBefore > 0) warnings.push(`${cntOutBefore} empleado(s) con last_out anterior a first_in — posible error de tipo de marcación`);
  if (cntOnlyOut  > 0) warnings.push(`${cntOnlyOut} empleado(s) con solo salida (sin entrada) para ${date}`);
  if (cntNoDept   > 0) warnings.push(`${cntNoDept} empleado(s) activo(s) sin departamento asignado — ejecutar POST /api/sync/departments`);
  if (cntNoName   > 0) warnings.push(`${cntNoName} empleado(s) activo(s) sin nombre completo — reimportar desde att2000`);
  if (dupCount    > 0) warnings.push(`${dupCount} par(es) de marcaciones duplicadas en attendance_logs para ${date} — aplicar migración 086`);

  res.json({
    ok: true,
    date,
    sync_lag_hours:           syncLagHours,
    last_raw_event_at:        lastRawEventAt,
    last_processed_event_at:  lastProcessedEventAt,
    warnings,
    sources: {
      att2000: {
        available:       att2000Available,
        total:           att2000Available ? (attTotal[0]?.cnt ?? 0) : null,
        today:           att2000Available ? (attToday?.[0]?.cnt ?? 0) : null,
        users_in_userinfo: att2000Available ? (attUsers?.[0]?.cnt ?? 0) : null,
        last_event_at:   attLastEventAt,
        last_event_user: att2000Available ? (attLastEvent?.[0]?.USERID ?? null) : null,
      },
      zkteco_bridge: {
        available:               totalDevices > 0,
        devices:                 totalDevices,
        bridge_devices_expected: bridgeDevicesExpected,
        bridge_devices_detected: bridgeDevicesDetected,
        last_poll_at:            bridgeLastPoll,
        raw_events_today:        rawToday,
      },
      local_raw: {
        total:     logTotalRow?.cnt || 0,
        today:     todayLogs,
        by_source: sourceBreakdown,
      },
      processed: {
        daily_summary_today:       dsTodayRow?.cnt || 0,
        absent_today:              absentToday?.cnt || 0,
        employees_with_only_in:    cntOnlyIn,
        employees_with_only_out:   cntOnlyOut,
        employees_out_before_in:   cntOutBefore,
      },
    },
    mapping: {
      employees_active:          activeEmployees,
      employees_with_code:       empWithCode?.cnt  || 0,
      employees_without_code:    empNoCode?.cnt    || 0,
      employees_no_department:   cntNoDept,
      employees_no_name:         cntNoName,
      unmatched_punches_total:   unmatchedCount?.cnt || 0,
    },
    duplicates: {
      attendance_logs_duplicates_today: dupCount,
      top_duplicate_samples:            dupSamples,
    },
    samples: {
      latest_raw:       latestRaw,
      latest_processed: latestProcessed,
      unmatched:        unmatchedRows,
    },
  });
});

// ─── GET /api/attendance/punch-time-audit ─────────────────────────────────
// Diagnóstico de desfase horario: compara att2000.CHECKTIME crudo vs
// attendance_logs.timestamp crudo para los mismos empleados/día.
// Query params:
//   date=YYYY-MM-DD  (default: hoy)
//   employee=texto   (nombre parcial o código — omitir para todos del día)
router.get('/punch-time-audit', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { sequelize } = require('../config/database');
  const date      = req.query.date || new Date().toISOString().split('T')[0];
  const empFilter = (req.query.employee || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, error: 'date debe ser YYYY-MM-DD' });
  }

  // ── 1. Empleados que coincidan con el filtro ────────────────────────
  let empSql = `SELECT id, code, first_name, last_name FROM employees WHERE status = 'active'`;
  const empRepl = [];
  if (empFilter) {
    empSql += ` AND (CONCAT(first_name,' ',last_name) LIKE ? OR code LIKE ?)`;
    empRepl.push(`%${empFilter}%`, `%${empFilter}%`);
  }
  empSql += ' LIMIT 20';

  let employees = [];
  try {
    [employees] = await sequelize.query(empSql, { replacements: empRepl });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
  if (!employees.length) {
    return res.json({
      ok: true, date, employee_filter: empFilter || null,
      records: [], total: 0, timezone_info: _auditTzInfo(),
      message: 'No se encontraron empleados con ese filtro',
    });
  }

  // ── 2. att2000: CHECKTIME como string crudo via CONVERT(varchar, 120) ──
  // CONVERT(varchar(19), CHECKTIME, 120) → "YYYY-MM-DD HH:MI:SS" sin timezone.
  // Filtramos en JS por código para evitar interpolación de datos de la BD en SQL.
  let att2000Rows = null; // null = att2000 no disponible
  try {
    const { getAtt2000 } = require('../config/att2000');
    const mssql = require('mssql');
    const db = await getAtt2000();
    const r = await db.request()
      .input('d', mssql.VarChar(10), date)
      .query(`
        SELECT
          CAST(c.USERID AS varchar(20))            AS USERID,
          CONVERT(varchar(19), c.CHECKTIME, 120)   AS raw_checktime,
          c.CHECKTYPE
        FROM CHECKINOUT c
        WHERE CONVERT(date, c.CHECKTIME) = @d
        ORDER BY c.CHECKTIME
      `);
    const codeSet = new Set(employees.map(e => String(e.code)).filter(Boolean));
    att2000Rows = r.recordset.filter(a => codeSet.has(a.USERID));
  } catch {}

  // ── 3. attendance_logs: timestamp crudo via DATE_FORMAT (sin conversión Sequelize) ──
  const empIds      = employees.map(e => e.id);
  const placeholders = empIds.map(() => '?').join(',');
  let localRows = [];
  try {
    [localRows] = await sequelize.query(
      `SELECT al.id, al.employee_id,
              DATE_FORMAT(al.timestamp, '%Y-%m-%d %H:%i:%s') AS raw_timestamp,
              al.type, al.source
       FROM attendance_logs al
       WHERE DATE(al.timestamp) = ?
         AND al.employee_id IN (${placeholders})
       ORDER BY al.timestamp`,
      { replacements: [date, ...empIds] }
    );
  } catch {}

  // ── 4. Cruzar registros por empleado y parear por proximidad ≤15 min ──
  const records = [];

  for (const emp of employees) {
    const codeStr   = String(emp.code || '');
    const attPunches = att2000Rows ? att2000Rows.filter(a => a.USERID === codeStr) : null;
    const locPunches = localRows.filter(l => l.employee_id === emp.id);
    if (!attPunches?.length && !locPunches.length) continue;

    const usedLocal = new Set();

    if (attPunches) {
      for (const att of attPunches) {
        // Ambos strings se parsean como UTC para que el diff revele el desfase de timezone
        const attMs = Date.parse(att.raw_checktime.replace(' ', 'T') + 'Z');
        let bestLoc = null, bestDelta = Infinity;
        for (const loc of locPunches) {
          if (usedLocal.has(loc.id)) continue;
          const locMs = Date.parse(loc.raw_timestamp.replace(' ', 'T') + 'Z');
          const delta = Math.abs(attMs - locMs);
          if (delta < bestDelta && delta <= 15 * 60000) { bestDelta = delta; bestLoc = loc; }
        }
        if (bestLoc) usedLocal.add(bestLoc.id);

        const diffMin = bestLoc
          ? Math.round(
              (Date.parse(bestLoc.raw_timestamp.replace(' ', 'T') + 'Z') - attMs) / 60000
            )
          : null;

        records.push({
          employee_id:   emp.id,
          employee_name: `${emp.first_name} ${emp.last_name}`,
          employee_code: emp.code,
          att2000: {
            raw_checktime: att.raw_checktime,
            checktype:     att.CHECKTYPE,
            userid:        att.USERID,
          },
          local: bestLoc ? {
            attendance_logs_id:        bestLoc.id,
            attendance_logs_timestamp: bestLoc.raw_timestamp,
            type:   bestLoc.type,
            source: bestLoc.source,
          } : null,
          diff_minutes: diffMin,
          status: diffMin === null ? 'no_match_local'
                : diffMin === 0   ? 'exact'
                : `offset_${diffMin > 0 ? '+' : ''}${diffMin}m`,
        });
      }
    }

    // Locales sin pareja en att2000
    for (const loc of locPunches) {
      if (usedLocal.has(loc.id)) continue;
      records.push({
        employee_id:   emp.id,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        employee_code: emp.code,
        att2000: null,
        local: {
          attendance_logs_id:        loc.id,
          attendance_logs_timestamp: loc.raw_timestamp,
          type:   loc.type,
          source: loc.source,
        },
        diff_minutes: null,
        status: 'no_match_att2000',
      });
    }
  }

  // ── 5. Resumen del desfase ─────────────────────────────────────────
  const diffs = records.filter(r => r.diff_minutes !== null).map(r => r.diff_minutes);
  const offsetSummary = diffs.length ? {
    count:            diffs.length,
    min_diff_minutes: Math.min(...diffs),
    max_diff_minutes: Math.max(...diffs),
    avg_diff_minutes: Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length),
    all_same_offset:  new Set(diffs).size === 1 ? diffs[0] : null,
  } : null;

  res.json({
    ok: true,
    date,
    employee_filter:   empFilter || null,
    att2000_available: att2000Rows !== null,
    timezone_info:     _auditTzInfo(),
    offset_summary:    offsetSummary,
    records,
    total:             records.length,
  });
});

function _auditTzInfo() {
  const { sequelize } = require('../config/database');
  return {
    process_tz:     process.env.TZ || '(not set)',
    node_version:   process.version,
    sequelize_tz:   sequelize.options.timezone || '(not set)',
    server_now_utc: new Date().toISOString(),
    server_now_py:  new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' }),
    note: 'raw_checktime y raw_timestamp se comparan tratando ambos como UTC ' +
          'para que diff_minutes revele el desfase exacto de timezone entre att2000 y MySQL',
  };
}

module.exports = router;
