/**
 * att2000Sync.js — Endpoints de sincronización att2000 → MySQL
 *
 * Monta en: /api/sync/att2000
 *
 * Todos los endpoints requieren autenticación + permisos admin/hr/super_admin.
 * Las funciones de escritura en att2000 están explícitamente deshabilitadas
 * salvo ATT2000_ALLOW_WRITE=true.
 */

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

const ADMIN_ROLES = ['admin', 'hr', 'super_admin'];

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

// ─── Helpers ─────────────────────────────────────────────────────
function getAtt2000Funcs() {
  return require('../config/att2000');
}

async function createSyncRun(srcId, type, entity, createdBy) {
  const [id] = await sequelize.query(`
    INSERT INTO source_sync_runs
      (source_system_id, sync_type, entity_type, status, started_at, created_by)
    VALUES (?, ?, ?, 'running', NOW(), ?)
  `, { replacements: [srcId, type, entity, createdBy || null] });
  return id;
}

async function finishSyncRun(runId, stats) {
  await sequelize.query(`
    UPDATE source_sync_runs SET
      status = ?, finished_at = NOW(),
      total_read = ?, total_inserted = ?, total_updated = ?,
      total_skipped = ?, total_errors = ?, error_message = ?
    WHERE id = ?
  `, { replacements: [
    stats.errors > 0 && stats.inserted === 0 ? 'failed' : 'completed',
    stats.read || 0, stats.inserted || 0, stats.updated || 0,
    stats.skipped || 0, stats.errors || 0, stats.errorMessage || null,
    runId,
  ]});
}

async function getSourceSystemId() {
  const [[src]] = await sequelize.query("SELECT id FROM source_systems WHERE code = 'att2000'");
  if (!src) throw new Error('Sistema fuente att2000 no registrado en source_systems');
  return src.id;
}

// ─── GET /api/sync/att2000/diagnose ──────────────────────────────
router.get('/diagnose', async (req, res) => {
  try {
    const { testAtt2000Connection, diagnoseAtt2000Schema, getAtt2000TableCounts, getAtt2000DateRange } = getAtt2000Funcs();
    const [conn, schema, counts, dateRange] = await Promise.allSettled([
      testAtt2000Connection(),
      diagnoseAtt2000Schema(),
      getAtt2000TableCounts(),
      getAtt2000DateRange(),
    ]);
    res.json({
      connection: conn.status === 'fulfilled' ? conn.value : { ok: false, error: conn.reason?.message },
      schema:     schema.status === 'fulfilled' ? schema.value : [],
      counts:     counts.status === 'fulfilled' ? counts.value : {},
      date_range: dateRange.status === 'fulfilled' ? dateRange.value : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/test-connection ───────────────────────
router.post('/test-connection', async (req, res) => {
  try {
    const { resetPool, testAtt2000Connection } = getAtt2000Funcs();
    // Si se pasan parámetros en el body, sobreescribir env vars temporalmente
    const { host, port, user, password, database } = req.body;
    if (host) process.env.ATT_HOST     = host;
    if (port) process.env.ATT_PORT     = String(port);
    if (user) process.env.ATT_USER     = user;
    if (password !== undefined) process.env.ATT_PASSWORD = password;
    if (database) process.env.ATT_DATABASE = database;
    resetPool();
    const result = await testAtt2000Connection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sync/att2000/schema ─────────────────────────────────
router.get('/schema', async (req, res) => {
  try {
    const { diagnoseAtt2000Schema } = getAtt2000Funcs();
    res.json(await diagnoseAtt2000Schema());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/counts ─────────────────────────────────
router.get('/counts', async (req, res) => {
  try {
    const { getAtt2000TableCounts } = getAtt2000Funcs();
    res.json(await getAtt2000TableCounts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/date-range ─────────────────────────────
router.get('/date-range', async (req, res) => {
  try {
    const { getAtt2000DateRange } = getAtt2000Funcs();
    res.json(await getAtt2000DateRange());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/import-departments ────────────────────
router.post('/import-departments', async (req, res) => {
  try {
    const { fetchAttDepartments } = getAtt2000Funcs();
    const srcId = await getSourceSystemId();
    const runId = await createSyncRun(srcId, 'full', 'departments', req.user.id);

    const depts = await fetchAttDepartments();
    let inserted = 0, skipped = 0, errors = 0;

    for (const d of depts) {
      try {
        const name = d.DeptName || d.DEPTNAME || String(d.DEPTID);
        const extId = String(d.DEPTID);
        await sequelize.query(`
          INSERT INTO departments (name, external_source, external_id, created_at, updated_at)
          VALUES (?, 'att2000', ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()
        `, { replacements: [name, extId] });
        inserted++;
      } catch { errors++; }
    }

    await finishSyncRun(runId, { read: depts.length, inserted, skipped, errors });
    res.json({ run_id: runId, read: depts.length, inserted, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/import-users ─────────────────────────
router.post('/import-users', async (req, res) => {
  try {
    const { fetchAttUsers } = getAtt2000Funcs();
    const { limit = 5000, offset = 0 } = req.body;
    const srcId = await getSourceSystemId();
    const runId = await createSyncRun(srcId, 'full', 'users', req.user.id);

    const users = await fetchAttUsers({ limit, offset });
    let inserted = 0, updated = 0, errors = 0;

    for (const u of users) {
      try {
        const sourceUserId = String(u.USERID);
        const rawName = u.Name || u.NAME || '';
        const badgeNum = u.BadgeNumber || u.BADGENUMBER || sourceUserId;

        await sequelize.query(`
          INSERT INTO source_employee_map
            (source_system_id, source_user_id, source_badge_number, raw_name, match_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'unmatched', NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            raw_name = VALUES(raw_name),
            source_badge_number = VALUES(source_badge_number),
            updated_at = NOW()
        `, { replacements: [srcId, sourceUserId, badgeNum, rawName] });
        inserted++;
      } catch { errors++; }
    }

    await finishSyncRun(runId, { read: users.length, inserted, updated, errors });
    res.json({ run_id: runId, read: users.length, inserted, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/import-punches ────────────────────────
// Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', limit: 10000 }
router.post('/import-punches', async (req, res) => {
  try {
    const { fetchAttPunches } = getAtt2000Funcs();
    const { from, to, limit = 10000 } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from y to son requeridos' });

    const srcId = await getSourceSystemId();
    const runId = await createSyncRun(srcId, 'full', 'punches', req.user.id);

    await sequelize.query(
      "UPDATE source_sync_runs SET from_datetime=?, to_datetime=? WHERE id=?",
      { replacements: [from, to, runId] }
    );

    const [empMaps] = await sequelize.query(
      'SELECT source_user_id, employee_id FROM source_employee_map WHERE source_system_id = ? AND employee_id IS NOT NULL',
      { replacements: [srcId] }
    );
    const empMap = {};
    for (const m of empMaps) empMap[String(m.source_user_id)] = m.employee_id;

    const punches = await fetchAttPunches({ from, to, limit });
    let staged = 0, imported = 0, unknown = 0, dupes = 0, errors = 0;

    const normalizeType = (ct) => {
      if (!ct) return 'unknown';
      const t = String(ct).toUpperCase();
      if (t === 'I' || t === '0') return 'in';
      if (t === 'O' || t === '1') return 'out';
      return 'unknown';
    };

    for (const p of punches) {
      try {
        const sourceUserId = String(p.USERID);
        const checkTime   = p.CHECKTIME;
        const checkType   = p.CHECKTYPE;
        const normType    = normalizeType(checkType);
        const empId       = empMap[sourceUserId] || null;

        // Staging
        await sequelize.query(`
          INSERT IGNORE INTO attendance_import_staging
            (sync_run_id, source_system_id, source_user_id, check_time, check_type,
             sensor_id, verify_code, raw_data, normalized_type, employee_id, import_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, { replacements: [
          runId, srcId, sourceUserId, checkTime, checkType || null,
          p.SENSORID || null, p.VERIFYCODE || null,
          JSON.stringify(p), normType, empId,
        ]});
        staged++;

        if (!empId) {
          // Evento desconocido
          await sequelize.query(`
            INSERT IGNORE INTO unknown_attendance_events
              (source_system_id, source_user_id, check_time, check_type, normalized_type,
               sensor_id, raw_data, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
          `, { replacements: [srcId, sourceUserId, checkTime, checkType || null, normType, p.SENSORID || null, JSON.stringify(p)] });
          unknown++;
          continue;
        }

        if (['in', 'out'].includes(normType)) {
          const [[dup]] = await sequelize.query(
            'SELECT id FROM attendance_logs WHERE employee_id=? AND timestamp=? LIMIT 1',
            { replacements: [empId, checkTime] }
          );
          if (!dup) {
            await sequelize.query(`
              INSERT INTO attendance_logs
                (employee_id, timestamp, type, source, source_system, raw_data, created_at)
              VALUES (?, ?, ?, 'att2000_import', 'att2000', ?, NOW())
            `, { replacements: [empId, checkTime, normType, JSON.stringify(p)] });
            imported++;
          } else {
            dupes++;
          }
        }
      } catch (e) {
        errors++;
        logger.error(`import-punches error: ${e.message}`);
      }
    }

    await finishSyncRun(runId, { read: punches.length, inserted: imported, skipped: dupes + unknown, errors });
    res.json({ run_id: runId, read: punches.length, staged, imported, unknown, dupes, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/import-incremental ────────────────────
router.post('/import-incremental', async (req, res) => {
  try {
    const { fetchAttPunchesSince } = getAtt2000Funcs();
    const safetyHours = parseInt(process.env.ATT2000_SAFETY_WINDOW_HOURS || '24');

    const [[lastImport]] = await sequelize.query(`
      SELECT MAX(timestamp) AS last_ts FROM attendance_logs
      WHERE source = 'att2000_import' OR source_system = 'att2000'
    `);

    let since;
    if (lastImport?.last_ts) {
      const d = new Date(lastImport.last_ts);
      d.setHours(d.getHours() - safetyHours);
      since = d.toISOString().slice(0, 19).replace('T', ' ');
    } else {
      const d = new Date();
      d.setHours(d.getHours() - 48);
      since = d.toISOString().slice(0, 19).replace('T', ' ');
    }

    const punches = await fetchAttPunchesSince({ since, limit: 5000 });
    res.json({ since, punches_available: punches.length, message: 'Usar import-punches con rango específico para importar' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/reconcile ─────────────────────────────
router.post('/reconcile', async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from y to requeridos' });

    const srcId = await getSourceSystemId();
    const runId = await createSyncRun(srcId, 'reconciliation', 'punches', req.user.id);

    const [empMaps] = await sequelize.query(
      'SELECT source_user_id, employee_id FROM source_employee_map WHERE source_system_id = ? AND employee_id IS NOT NULL',
      { replacements: [srcId] }
    );

    let issues = 0;
    for (const m of empMaps) {
      const [[local]] = await sequelize.query(`
        SELECT COUNT(*) AS cnt FROM attendance_logs
        WHERE employee_id = ? AND timestamp BETWEEN ? AND ?
      `, { replacements: [m.employee_id, from, to] });

      if ((local?.cnt || 0) === 0) {
        await sequelize.query(`
          INSERT IGNORE INTO attendance_reconciliation_results
            (sync_run_id, employee_id, date, issue_type, source_count, local_count, status, details_json, created_at)
          VALUES (?, ?, ?, 'missing_local', NULL, 0, 'open', ?, NOW())
        `, { replacements: [runId, m.employee_id, from, JSON.stringify({ from, to })] });
        issues++;
      }
    }

    await finishSyncRun(runId, { read: empMaps.length, inserted: issues, errors: 0 });
    res.json({ run_id: runId, employees_checked: empMaps.length, issues_found: issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/runs ───────────────────────────────────
router.get('/runs', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const [runs] = await sequelize.query(`
      SELECT ssr.*, ss.name AS source_name
      FROM source_sync_runs ssr
      JOIN source_systems ss ON ss.id = ssr.source_system_id
      WHERE ss.code = 'att2000'
        ${status ? 'AND ssr.status = ?' : ''}
      ORDER BY ssr.created_at DESC
      LIMIT ?
    `, { replacements: status ? [status, parseInt(limit)] : [parseInt(limit)] });
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/runs/:id ──────────────────────────────
router.get('/runs/:id', async (req, res) => {
  try {
    const [[run]] = await sequelize.query('SELECT * FROM source_sync_runs WHERE id = ?', { replacements: [req.params.id] });
    if (!run) return res.status(404).json({ error: 'Run no encontrado' });
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/errors ─────────────────────────────────
router.get('/errors', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT ais.*, sem.raw_name
      FROM attendance_import_staging ais
      LEFT JOIN source_employee_map sem ON sem.source_user_id = ais.source_user_id
        AND sem.source_system_id = ais.source_system_id
      WHERE ais.import_status = 'error'
      ORDER BY ais.check_time DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/unknown-events ─────────────────────────
router.get('/unknown-events', async (req, res) => {
  try {
    const { status = 'pending', limit = 100 } = req.query;
    const [rows] = await sequelize.query(`
      SELECT * FROM unknown_attendance_events
      WHERE status = ?
      ORDER BY check_time DESC
      LIMIT ?
    `, { replacements: [status, parseInt(limit)] });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/unknown-events/:id/assign ─────────────
router.post('/unknown-events/:id/assign', async (req, res) => {
  try {
    const { employee_id, notes } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id requerido' });

    const [[evt]] = await sequelize.query('SELECT * FROM unknown_attendance_events WHERE id = ?', { replacements: [req.params.id] });
    if (!evt) return res.status(404).json({ error: 'Evento no encontrado' });

    // Actualizar mapeo
    const srcId = await getSourceSystemId();
    await sequelize.query(`
      UPDATE source_employee_map SET employee_id = ?, match_status = 'manual', updated_at = NOW()
      WHERE source_system_id = ? AND source_user_id = ?
    `, { replacements: [employee_id, srcId, evt.source_user_id] });

    // Marcar como asignado
    await sequelize.query(`
      UPDATE unknown_attendance_events
      SET status = 'assigned', assigned_to_employee = ?, assigned_by = ?, assigned_at = NOW(), notes = ?
      WHERE id = ?
    `, { replacements: [employee_id, req.user.id, notes || null, evt.id] });

    // Insertar en attendance_logs si no existe
    const normType = evt.normalized_type;
    if (['in', 'out'].includes(normType)) {
      const [[dup]] = await sequelize.query(
        'SELECT id FROM attendance_logs WHERE employee_id=? AND timestamp=? LIMIT 1',
        { replacements: [employee_id, evt.check_time] }
      );
      if (!dup) {
        await sequelize.query(`
          INSERT INTO attendance_logs (employee_id, timestamp, type, source, source_system, raw_data, created_at)
          VALUES (?, ?, ?, 'manual_assign', 'att2000', ?, NOW())
        `, { replacements: [employee_id, evt.check_time, normType, evt.raw_data || null] });
      }
    }

    res.json({ ok: true, employee_id, event_id: evt.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/employee-map ──────────────────────────
router.get('/employee-map', async (req, res) => {
  try {
    const { status, limit = 200, offset = 0 } = req.query;
    const srcId = await getSourceSystemId();
    const cond = status ? 'AND sem.match_status = ?' : '';
    const replacements = status
      ? [srcId, status, parseInt(limit), parseInt(offset)]
      : [srcId, parseInt(limit), parseInt(offset)];
    const [rows] = await sequelize.query(`
      SELECT sem.*,
             e.first_name, e.last_name, e.code AS employee_code
      FROM source_employee_map sem
      LEFT JOIN employees e ON e.id = sem.employee_id
      WHERE sem.source_system_id = ? ${cond}
      ORDER BY sem.match_status, sem.raw_name
      LIMIT ? OFFSET ?
    `, { replacements });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/att2000/reconcile-results ──────────────────────
router.get('/reconcile-results', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const cond = status ? 'AND r.status = ?' : '';
    const replacements = status ? [status, parseInt(limit)] : [parseInt(limit)];
    const [rows] = await sequelize.query(`
      SELECT r.*,
             e.first_name, e.last_name, e.code AS employee_code
      FROM attendance_reconciliation_results r
      LEFT JOIN employees e ON e.id = r.employee_id
      WHERE 1=1 ${cond}
      ORDER BY r.created_at DESC
      LIMIT ?
    `, { replacements });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/att2000/employee-map/:id/assign ──────────────
// Asigna manualmente un source_employee_map entry a un empleado local.
router.post('/employee-map/:id/assign', async (req, res) => {
  try {
    const { employee_id, notes } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id requerido' });

    const [[entry]] = await sequelize.query(
      'SELECT * FROM source_employee_map WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!entry) return res.status(404).json({ error: 'Entrada no encontrada' });

    // Verificar que el empleado existe
    const [[emp]] = await sequelize.query(
      'SELECT id, first_name, last_name, code FROM employees WHERE id = ?',
      { replacements: [parseInt(employee_id)] }
    );
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    await sequelize.query(`
      UPDATE source_employee_map
      SET employee_id = ?, match_status = 'manual',
          notes = ?, updated_at = NOW()
      WHERE id = ?
    `, { replacements: [emp.id, notes || null, entry.id] });

    logger.info(`employee-map ${entry.id} (${entry.raw_name}) → empleado ${emp.id} (${emp.code}) por usuario ${req.user.id}`);
    res.json({ ok: true, source_map_id: entry.id, employee: { id: emp.id, code: emp.code, name: `${emp.first_name} ${emp.last_name}` } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET/POST /api/sync/att2000/source-mode ───────────────────────
router.get('/source-mode', async (req, res) => {
  try {
    const [[row]] = await sequelize.query("SELECT `value` FROM settings WHERE `key` = 'attendance.source_mode'");
    res.json({ mode: row?.value || 'legacy_att2000' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/source-mode', async (req, res) => {
  try {
    const { mode } = req.body;
    const valid = ['legacy_att2000', 'hybrid', 'direct_only'];
    if (!valid.includes(mode)) return res.status(400).json({ error: `Modo inválido. Valores: ${valid.join(', ')}` });

    await sequelize.query(
      "UPDATE settings SET `value` = ?, updated_at = NOW() WHERE `key` = 'attendance.source_mode'",
      { replacements: [mode] }
    );
    logger.info(`attendance.source_mode → ${mode} (por usuario ${req.user.id})`);
    res.json({ ok: true, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
