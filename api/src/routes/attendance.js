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
  let devicesDb = 0;
  let bridgeLastPoll = null;
  try {
    const [devRows] = await sequelize.query(
      'SELECT COUNT(*) AS cnt, MAX(last_sync) AS last_poll FROM devices'
    );
    devicesDb    = devRows[0]?.cnt || 0;
    bridgeLastPoll = devRows[0]?.last_poll || null;
  } catch {
    try {
      const [devRows] = await sequelize.query('SELECT COUNT(*) AS cnt FROM devices');
      devicesDb = devRows[0]?.cnt || 0;
    } catch {}
  }
  const envDevicesStr = process.env.ZKTECO_DEVICES || '';
  const devicesEnv = envDevicesStr
    ? envDevicesStr.split(',').filter(s => s.trim()).length
    : 0;
  const devicesDetected = Math.max(devicesDb, devicesEnv);

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

  // ── 6b. Totales de departamentos y último sync de USERINFO ──────
  const deptTotalRow = await qLocalOne('SELECT COUNT(*) AS cnt FROM departments', null);
  const userinfoSyncRow = await qLocalOne(
    "SELECT `value` AS ts FROM settings WHERE `key` = 'userinfo_last_sync_at'", null
  );

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
  if (devicesEnv > 0 && devicesDb === 0) {
    warnings.push(`Bridge: ${devicesEnv} dispositivos configurados en ZKTECO_DEVICES pero tabla devices vacía — ejecutar POST /api/sync/devices`);
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
        available:         devicesDetected > 0,
        devices_env:       devicesEnv,
        devices_db:        devicesDb,
        devices_detected:  devicesDetected,
        last_poll_at:      bridgeLastPoll,
        raw_events_today:  rawToday,
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
      employees_active:            activeEmployees,
      employees_with_code:         empWithCode?.cnt  || 0,
      employees_without_code:      empNoCode?.cnt    || 0,
      employees_no_department:     cntNoDept,
      employees_without_name:      cntNoName,
      employees_no_name:           cntNoName,
      departments_total:           deptTotalRow?.cnt || 0,
      latest_userinfo_sync_at:     userinfoSyncRow?.ts || null,
      unmatched_punches_total:     unmatchedCount?.cnt || 0,
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

// ─── Shared handler: borra + reimporta + recalcula ────────────────────────
// Usado por /reimport-range y /reimport-range-safe (mismo comportamiento).
async function _runReimportRange(date_from, date_to) {
  const { syncAttendance }  = require('../config/zkAdapter');
  const { bulkRecalcDailySummary, pyDateStr } = require('../services/scheduler');
  const { sequelize } = require('../config/database');
  const logger = require('../config/logger');

  // 1. Contar y borrar registros source='device' del rango
  //    NOTA: cubre att2000 y ZKTeco bridge; solo ejecutar en rangos
  //    donde la única fuente era att2000 con timestamps erróneos.
  const [[beforeRow]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM attendance_logs
     WHERE source = 'device' AND DATE(timestamp) BETWEEN ? AND ?`,
    { replacements: [date_from, date_to] }
  );
  const deleted = beforeRow?.cnt || 0;

  await sequelize.query(
    `DELETE FROM attendance_logs
     WHERE source = 'device' AND DATE(timestamp) BETWEEN ? AND ?`,
    { replacements: [date_from, date_to] }
  );
  logger.info(`reimport-range: eliminados ${deleted} registros (${date_from} → ${date_to})`);

  // 2. Reimportar desde att2000 — checktimeToStr() guarda CHECKTIME sin offset
  let raw = { imported: 0, skipped: 0, notFound: 0, total: 0 };
  try {
    raw = await syncAttendance({ dateFrom: date_from, dateTo: date_to });
  } catch (importErr) {
    const err = new Error(`att2000 no disponible: ${importErr.message}`);
    err.status = 502;
    err.deleted = deleted;
    throw err;
  }

  // 3. Recalcular daily_summary para cada fecha del rango.
  // Iterar las cadenas de fecha directamente para evitar conversión de zona horaria:
  // new Date('YYYY-MM-DDT00:00:00Z') → pyDateStr() con UTC-4 devuelve el día anterior.
  const recalculated_dates = [];
  let _cur = date_from;
  while (_cur <= date_to) {
    recalculated_dates.push(_cur);
    const [y, m, d] = _cur.split('-').map(Number);
    _cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }

  const recalc_errors = [];
  for (const d of recalculated_dates) {
    try { await bulkRecalcDailySummary(d); }
    catch (e) { recalc_errors.push({ date: d, error: e.message }); }
  }

  return {
    ok:                 true,
    date_from,
    date_to,
    deleted,
    source_total:       raw.total,
    inserted:           raw.imported,
    skipped_duplicates: raw.skipped,
    not_found:          raw.notFound,
    recalculated_dates,
    ...(recalc_errors.length ? { recalc_errors } : {}),
    message: `${deleted} registros borrados, ${raw.imported} reimportados con timestamp correcto`,
  };
}

function _validateReimportBody(req, res) {
  const { date_from, date_to } = req.body;
  if (!date_from || !date_to) {
    res.status(400).json({ ok: false, error: 'date_from y date_to son requeridos (YYYY-MM-DD)' });
    return null;
  }
  const dtFrom = new Date(date_from + 'T00:00:00Z');
  const dtTo   = new Date(date_to   + 'T00:00:00Z');
  if (isNaN(dtFrom) || isNaN(dtTo) || dtFrom > dtTo) {
    res.status(400).json({ ok: false, error: 'Rango de fechas inválido' });
    return null;
  }
  if (Math.round((dtTo - dtFrom) / 86400000) > 31) {
    res.status(400).json({ ok: false, error: 'El rango no puede superar 31 días' });
    return null;
  }
  return { date_from, date_to };
}

// ─── POST /api/attendance/reimport-range-safe ─────────────────────────────
// Borra attendance_logs (source='device') en el rango y reimporta desde att2000
// usando CHECKTIME sin conversión de timezone. Recalcula daily_summary.
//
// Body: { date_from: "YYYY-MM-DD", date_to: "YYYY-MM-DD" }  (máx 31 días)
// Respuesta: { deleted, source_total, inserted, skipped_duplicates, not_found,
//              recalculated_dates, message }
router.post('/reimport-range-safe', authorize('admin', 'super_admin'), async (req, res) => {
  const dates = _validateReimportBody(req, res);
  if (!dates) return;
  try {
    res.json(await _runReimportRange(dates.date_from, dates.date_to));
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message,
      ...(err.deleted !== undefined ? { deleted: err.deleted } : {}) });
  }
});

// ─── POST /api/attendance/reimport-range (alias backward-compat) ──────────
router.post('/reimport-range', authorize('admin', 'super_admin'), async (req, res) => {
  const dates = _validateReimportBody(req, res);
  if (!dates) return;
  try {
    res.json(await _runReimportRange(dates.date_from, dates.date_to));
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message,
      ...(err.deleted !== undefined ? { deleted: err.deleted } : {}) });
  }
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

// ─── GET /api/attendance/policy/resolve ──────────────────────────────────────
router.get('/policy/resolve', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { employee_id } = req.query;
  if (!employee_id) return res.status(400).json({ error: 'employee_id requerido' });
  try {
    const { resolvePolicy } = require('../services/attendancePolicyResolver');
    const policy = await resolvePolicy(+employee_id);
    res.json({ ok: true, policy });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/attendance/policies ────────────────────────────────────────────
router.get('/policies', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { listPolicies } = require('../services/attendancePolicyResolver');
    res.json({ ok: true, data: await listPolicies() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/attendance/policies ───────────────────────────────────────────
router.post('/policies', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { upsertPolicy } = require('../services/attendancePolicyResolver');
    const id = await upsertPolicy(req.body);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/attendance/policies/:id ────────────────────────────────────────
router.put('/policies/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { upsertPolicy } = require('../services/attendancePolicyResolver');
    await upsertPolicy({ ...req.body, id: +req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/attendance/policies/:id ─────────────────────────────────────
router.delete('/policies/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { deletePolicy } = require('../services/attendancePolicyResolver');
    await deletePolicy(+req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/attendance/process-day-v2 ─────────────────────────────────────
// Recalcula daily_summary usando el motor V2 con políticas.
// Body: { date: "YYYY-MM-DD", employee_id?: N }  (sin employee_id = todos del día)
router.post('/process-day-v2', authorize('admin', 'super_admin'), async (req, res) => {
  const { date, employee_id } = req.body || {};
  if (!date) return res.status(400).json({ ok: false, error: 'date requerido (YYYY-MM-DD)' });
  try {
    const { bulkProcessDay, processAttendanceDay } = require('../services/attendanceProcessor');
    if (employee_id) {
      const result = await processAttendanceDay({ date, employeeId: +employee_id });
      res.json({ ok: true, date, employee_id: +employee_id, ...result.finalMetrics, policy: result.policy });
    } else {
      const result = await bulkProcessDay(date);
      const hasErrors = result.errors > 0;
      res.json({ ok: !hasErrors, ...result });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/attendance/day-timeline ────────────────────────────────────────
// Línea de tiempo visual de la jornada de un empleado para una fecha.
// Query params:
//   date=YYYY-MM-DD  (obligatorio)
//   employee_id=N    (obligatorio)
// Respuesta: { employee, date, raw_logs, segments, summary, anomalies }
router.get('/day-timeline', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { sequelize } = require('../config/database');
  const { date, employee_id } = req.query;
  if (!date || !employee_id) {
    return res.status(400).json({ ok: false, error: 'date y employee_id son requeridos (query params)' });
  }

  try {
    // Empleado
    const [[emp]] = await sequelize.query(`
      SELECT e.id, e.first_name, e.last_name, e.code, e.employee_number, e.status,
             CONCAT(e.first_name,' ',e.last_name) AS full_name,
             CASE WHEN d.name IS NULL OR d.name = 'This Company'
               THEN 'Sin departamento asignado' ELSE d.name END AS department,
             s.name AS schedule_name, s.check_in, s.check_out
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN schedules   s ON s.id = e.schedule_id
      WHERE e.id = ?
    `, { replacements: [+employee_id] });

    if (!emp) return res.status(404).json({ ok: false, error: `Empleado ${employee_id} no encontrado` });

    // Logs crudos
    const [raw_logs] = await sequelize.query(`
      SELECT al.id, al.timestamp, al.type, al.source, al.device_id,
             d.name AS device_name, d.ip_address
      FROM attendance_logs al
      LEFT JOIN devices d ON d.id = al.device_id
      WHERE al.employee_id = ? AND DATE(al.timestamp) = ?
      ORDER BY al.timestamp ASC
    `, { replacements: [+employee_id, date] });

    // Segmentos (si migración 088 aplicada)
    const [segments] = await sequelize.query(`
      SELECT * FROM attendance_segments
      WHERE employee_id = ? AND work_date = ?
      ORDER BY segment_index ASC
    `, { replacements: [+employee_id, date] }).catch(() => [[]]);

    // Resumen del día
    const [[summary]] = await sequelize.query(`
      SELECT ds.*, s.name AS schedule_name
      FROM daily_summary ds
      LEFT JOIN schedules s ON s.id = ds.schedule_id
      WHERE ds.employee_id = ? AND ds.date = ?
    `, { replacements: [+employee_id, date] }).catch(() => [[null]]);

    // Anomalías (si migración 088 aplicada)
    const [anomalies] = await sequelize.query(`
      SELECT id, anomaly_type, severity, message, raw_payload, resolved, created_at
      FROM attendance_anomalies
      WHERE employee_id = ? AND work_date = ?
      ORDER BY severity DESC, created_at ASC
    `, { replacements: [+employee_id, date] }).catch(() => [[[]]]);

    // att2000 para comparación (si disponible)
    let att2000_punches = null;
    try {
      const { queryAtt2000 } = require('../config/att2000');
      att2000_punches = await queryAtt2000(`
        SELECT CONVERT(varchar, c.CHECKTIME, 120) AS raw_checktime, c.CHECKTYPE
        FROM CHECKINOUT c
        JOIN USERINFO u ON u.USERID = c.USERID
        JOIN employees e ON e.code = CAST(c.USERID AS varchar)
        WHERE e.id = ${+employee_id}
          AND CONVERT(date, c.CHECKTIME) = '${date}'
        ORDER BY c.CHECKTIME ASC
      `);
    } catch {
      // att2000 no disponible
    }

    // Política efectiva
    let policy = null;
    try {
      const { resolvePolicy } = require('../services/attendancePolicyResolver');
      policy = await resolvePolicy(+employee_id);
    } catch { /* opcional */ }

    const { formatMysqlDateTimeLocal } = require('../services/attendanceProcessor');

    // Calcular estado de cada log crudo basado en las anomalías guardadas
    // para que la UI pueda mostrar badges sin necesidad de reprocesar.
    const parsedAnomalies = anomalies.map(a => ({
      ...a,
      raw_payload: typeof a.raw_payload === 'string'
        ? (() => { try { return JSON.parse(a.raw_payload); } catch { return {}; } })()
        : (a.raw_payload || {}),
    }));

    const suggestedExclusionIds = new Set(
      parsedAnomalies
        .filter(a => a.anomaly_type === 'duplicate_nearby')
        .map(a => a.raw_payload?.log_id)
        .filter(Boolean)
    );

    // Recoge IDs de logs desde todos los campos de raw_payload que referencian un log.
    // missing_out usa in_log_id, out_before_in usa in_log_id+out_log_id, etc.
    const reviewRequiredIds = new Set();
    for (const a of parsedAnomalies) {
      const p = a.raw_payload || {};
      if (p.log_id)      reviewRequiredIds.add(p.log_id);
      if (p.near_log_id) reviewRequiredIds.add(p.near_log_id);
      if (p.in_log_id)   reviewRequiredIds.add(p.in_log_id);
      if (p.out_log_id)  reviewRequiredIds.add(p.out_log_id);
    }

    const logsWithLocal = raw_logs.map(l => ({
      ...l,
      timestamp_local:     formatMysqlDateTimeLocal(l.timestamp),
      used_in_calculation: !suggestedExclusionIds.has(l.id),
      suggested_exclusion: suggestedExclusionIds.has(l.id),
      requires_review:     reviewRequiredIds.has(l.id),
    }));

    const segmentsWithLocal = segments.map(s => ({
      ...s,
      in_at_local:  formatMysqlDateTimeLocal(s.in_at),
      out_at_local: formatMysqlDateTimeLocal(s.out_at),
    }));
    const summaryWithLocal = summary ? {
      ...summary,
      first_in_local:     formatMysqlDateTimeLocal(summary.first_in),
      last_out_local:     formatMysqlDateTimeLocal(summary.last_out),
      lunch_out_local:    formatMysqlDateTimeLocal(summary.lunch_out),
      lunch_in_local:     formatMysqlDateTimeLocal(summary.lunch_in),
      calculation_status: summary.calculation_status || 'provisional',
      requires_review:    Boolean(summary.requires_review),
    } : null;

    // Construir calculation_explanation desde las anomalías guardadas.
    // El motor lo computa en memoria pero no lo persiste en DB, así que lo
    // reconstruimos aquí para que day-timeline siempre devuelva un array (nunca null).
    const calculationExplanation = [];
    for (const a of parsedAnomalies) {
      const p = a.raw_payload || {};
      if (a.anomaly_type === 'duplicate_nearby') {
        const exclLog = raw_logs.find(l => l.id === p.log_id);
        const nearLog = raw_logs.find(l => l.id === p.near_log_id);
        const exclTs = exclLog ? formatMysqlDateTimeLocal(exclLog.timestamp)?.slice(11, 19) : '?';
        const nearTs = nearLog ? formatMysqlDateTimeLocal(nearLog.timestamp)?.slice(11, 19) : '?';
        calculationExplanation.push(
          `${exclTs} posible duplicado cercano de ${nearTs}; no se elimina y requiere revisión.`
        );
      } else if (a.anomaly_type === 'missing_out') {
        const inLog = raw_logs.find(l => l.id === p.in_log_id);
        const inTs  = inLog ? formatMysqlDateTimeLocal(inLog.timestamp)?.slice(11, 19) : '?';
        calculationExplanation.push(
          `${inTs} entrada sin salida posterior; requiere revisión.`
        );
      } else if (a.anomaly_type === 'missing_in') {
        const outLog = raw_logs.find(l => l.id === p.out_log_id);
        const outTs  = outLog ? formatMysqlDateTimeLocal(outLog.timestamp)?.slice(11, 19) : '?';
        calculationExplanation.push(
          `${outTs} salida sin entrada previa; requiere revisión.`
        );
      } else if (a.anomaly_type === 'out_before_in') {
        calculationExplanation.push(a.message || 'Salida anterior a entrada; requiere revisión.');
      } else if (a.anomaly_type === 'long_shift') {
        calculationExplanation.push(a.message || 'Jornada extensa detectada.');
      }
    }
    if (summaryWithLocal) {
      const s = summaryWithLocal;
      if (s.gross_minutes != null) {
        calculationExplanation.push(
          `Resultado provisional: gross=${s.gross_minutes} min, descanso=${s.break_minutes || 0} min, trabajado=${s.worked_minutes || 0} min.`
        );
      }
      calculationExplanation.push(s.requires_review
        ? 'Estado: provisional — requiere revisión por supervisor/RRHH antes de impactar nómina.'
        : 'Estado: provisional — puede aprobarse sin correcciones.');
    }

    res.json({
      ok: true,
      employee: emp,
      date,
      policy,
      raw_logs:              logsWithLocal,
      suggested_exclusions:  logsWithLocal.filter(l => l.suggested_exclusion),
      review_required_logs:  logsWithLocal.filter(l => l.requires_review),
      segments:              segmentsWithLocal,
      summary:               summaryWithLocal,
      anomalies:             parsedAnomalies,
      calculation_explanation: calculationExplanation,
      att2000_punches,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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

// ─── GET /api/attendance/review-queue ────────────────────────────────────────
// Devuelve empleados que requieren revisión para una fecha dada:
// - daily_summary.requires_review = 1, O
// - tienen ajustes pendientes para ese día
router.get('/review-queue', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ ok: false, error: 'El parámetro date (YYYY-MM-DD) es requerido' });
  }
  try {
    const { sequelize } = require('../config/database');
    const sql = `
      SELECT
        e.id AS employee_id,
        CONCAT(e.first_name,' ',e.last_name) AS full_name,
        COALESCE(d.name, 'Sin departamento') AS department,
        ds.calculation_status,
        ds.requires_review,
        ds.worked_minutes,
        ds.status AS day_status,
        COUNT(DISTINCT CASE WHEN aa.status = 'pending' THEN aa.id END) AS pending_adjustments,
        GROUP_CONCAT(DISTINCT an.anomaly_type ORDER BY an.anomaly_type SEPARATOR ',') AS anomaly_types
      FROM employees e
      JOIN daily_summary ds ON ds.employee_id = e.id AND ds.date = ?
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN attendance_anomalies an ON an.employee_id = e.id AND an.work_date = ? AND an.resolved = 0
      LEFT JOIN attendance_adjustments aa ON aa.employee_id = e.id AND aa.work_date = ?
      WHERE ds.requires_review = 1
         OR EXISTS (
           SELECT 1 FROM attendance_adjustments aa2
           WHERE aa2.employee_id = e.id AND aa2.work_date = ? AND aa2.status = 'pending'
         )
      GROUP BY e.id, e.first_name, e.last_name, d.name, ds.calculation_status, ds.requires_review, ds.worked_minutes, ds.status
      ORDER BY ds.requires_review DESC, e.first_name, e.last_name
    `;
    const [rows] = await sequelize.query(sql, { replacements: [date, date, date, date] });
    res.json({ ok: true, date, total: rows.length, employees: rows });
  } catch (err) {
    const logger = require('../config/logger');
    logger.error('review-queue GET:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
