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

// ─── POST /api/attendance/import-att2000 ─────────────────────────────────────
// Importa marcaciones de att2000 hacia attendance_logs y recalcula daily_summary.
// Accesible a admin y hr (sin requerir super_admin como /api/sync/).
// Body: { date_from: "YYYY-MM-DD", date_to: "YYYY-MM-DD" }
// Respuesta: { ok, date_from, date_to, import: {...}, recalc: { dates, count, errors } }
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
  const diffDays = Math.round((dtTo - dtFrom) / 86400000);
  if (diffDays > 31) {
    return res.status(400).json({ ok: false, error: 'El rango no puede superar 31 días por ejecución' });
  }

  try {
    const { syncAttendance }  = require('../config/zkAdapter');
    const { bulkRecalcDailySummary, pyDateStr } = require('../services/scheduler');

    // 1. Importar att2000.CHECKINOUT → attendance_logs (INSERT IGNORE, idempotente)
    let importResult = { imported: 0, skipped: 0, notFound: 0, total: 0 };
    try {
      importResult = await syncAttendance({ dateFrom: date_from, dateTo: date_to });
    } catch (importErr) {
      return res.status(502).json({
        ok: false,
        error: `Error conectando a att2000: ${importErr.message}`,
        date_from, date_to,
      });
    }

    // 2. Recalcular daily_summary para cada fecha del rango
    const dates = [];
    const cur = new Date(dtFrom);
    while (cur <= dtTo) {
      dates.push(pyDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const recalcErrors = [];
    for (const d of dates) {
      try {
        await bulkRecalcDailySummary(d);
      } catch (e) {
        recalcErrors.push({ date: d, error: e.message });
      }
    }

    res.json({
      ok: true,
      date_from,
      date_to,
      import: importResult,
      recalc: { dates, count: dates.length, errors: recalcErrors },
    });
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

  // ── 6. Sin mapeo (unmapped punches) ─────────────────────────────
  const unmatchedRows = await qLocal(
    'SELECT source_user_id, badge_number, check_time FROM unknown_attendance_events ORDER BY check_time DESC LIMIT 5',
    null
  );
  const unmatchedCount = await qLocalOne('SELECT COUNT(*) AS cnt FROM unknown_attendance_events', null);

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
        available:              totalDevices > 0,
        devices:                totalDevices,
        bridge_devices_expected: bridgeDevicesExpected,
        bridge_devices_detected: bridgeDevicesDetected,
        last_poll_at:           bridgeLastPoll,
        raw_events_today:       rawToday,
      },
      local_raw: {
        total:     logTotalRow?.cnt || 0,
        today:     todayLogs,
        by_source: sourceBreakdown,
      },
      processed: {
        daily_summary_today: dsTodayRow?.cnt || 0,
        absent_today:        absentToday?.cnt || 0,
      },
    },
    mapping: {
      employees_active:        activeEmployees,
      employees_with_code:     empWithCode?.cnt  || 0,
      employees_without_code:  empNoCode?.cnt    || 0,
      unmatched_punches_total: unmatchedCount?.cnt || 0,
    },
    samples: {
      latest_raw:       latestRaw,
      latest_processed: latestProcessed,
      unmatched:        unmatchedRows,
    },
  });
});

module.exports = router;
