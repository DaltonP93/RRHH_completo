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

  // ── 2. Bridge ZKTeco ────────────────────────────────────────────
  let bridgeDevices = 0;
  let bridgeLastPoll = null;
  try {
    const [devRows] = await sequelize.query(
      'SELECT COUNT(*) AS cnt, MAX(last_sync_at) AS last_sync FROM devices'
    );
    bridgeDevices  = devRows[0]?.cnt || 0;
    bridgeLastPoll = devRows[0]?.last_sync || null;
  } catch {}
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

  res.json({
    ok: true,
    date,
    sources: {
      att2000: {
        available:      att2000Available,
        total:          att2000Available ? (attTotal[0]?.cnt ?? 0) : null,
        today:          att2000Available ? (attToday?.[0]?.cnt ?? 0) : null,
        users_in_userinfo: att2000Available ? (attUsers?.[0]?.cnt ?? 0) : null,
        last_event_at:  att2000Available ? (attLastEvent?.[0]?.ts ?? null) : null,
        last_event_user: att2000Available ? (attLastEvent?.[0]?.USERID ?? null) : null,
      },
      zkteco_bridge: {
        available:         bridgeDevices > 0,
        devices:           bridgeDevices,
        last_poll_at:      bridgeLastPoll,
        raw_events_today:  rawToday,
      },
      local_raw: {
        total:  logTotalRow?.cnt || 0,
        today:  logTodayRow?.cnt || 0,
        by_source: sourceBreakdown,
      },
      processed: {
        daily_summary_today:  dsTodayRow?.cnt || 0,
        absent_today:         absentToday?.cnt || 0,
      },
    },
    mapping: {
      employees_active:               empTotalRow?.cnt  || 0,
      employees_with_code:            empWithCode?.cnt  || 0,
      employees_without_code:         empNoCode?.cnt    || 0,
      unmatched_punches_total:        unmatchedCount?.cnt || 0,
    },
    samples: {
      latest_raw:       latestRaw,
      latest_processed: latestProcessed,
      unmatched:        unmatchedRows,
    },
  });
});

module.exports = router;
