/**
 * worker-sync — Sincronización incremental att2000 → MySQL local
 *
 * Corre como proceso PM2 separado (cwd: api/).
 * Lee nuevas marcaciones de att2000 desde el último CHECKTIME importado
 * y las inserta en attendance_logs via staging.
 *
 * Variables de entorno relevantes:
 *   ATT2000_INCREMENTAL_ENABLED   = true|false (default: false)
 *   ATT2000_INCREMENTAL_CRON      = "asterisco/5 asterisco asterisco asterisco asterisco"  (cron, cada 5 min)
 *   ATT2000_SAFETY_WINDOW_HOURS   = 24           (ventana de seguridad)
 *   SERVICE_NAME                  = worker-sync
 */

require('dotenv').config();
process.env.SERVICE_NAME = 'worker-sync';

const { sequelize } = require('./src/config/database');
const { createClient } = require('redis');
const logger = require('./src/config/logger');

// ─── Redis ──────────────────────────────────────────────────────
let redis = null;
async function initRedis() {
  try {
    redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    redis.on('error', err => logger.error('Redis error: ' + err.message));
    await redis.connect();
    logger.info('Redis conectado');
  } catch (err) {
    logger.warn('Redis no disponible — worker-sync funcionará sin pubsub: ' + err.message);
  }
}

// ─── Publicar evento en Redis ────────────────────────────────────
async function publishAttendance(event) {
  if (!redis?.isReady) return;
  try {
    await redis.publish('attendance:new', JSON.stringify(event));
  } catch {}
}

// ─── Sincronización incremental ──────────────────────────────────
async function runIncrementalSync() {
  const label = `[sync-${Date.now()}]`;
  try {
    // Verificar source_mode
    const [[modeSetting]] = await sequelize.query(
      "SELECT `value` FROM settings WHERE `key` = 'attendance.source_mode'"
    );
    const mode = modeSetting?.value || 'legacy_att2000';
    if (mode === 'direct_only') {
      logger.info(`${label} source_mode=direct_only — sync omitido`);
      return;
    }

    const { queryAtt2000, getTableColumns, pickCol } = require('./src/config/att2000');
    const safetyHours = parseInt(process.env.ATT2000_SAFETY_WINDOW_HOURS || '24');

    // Obtener última marcación importada
    const [[lastImport]] = await sequelize.query(`
      SELECT MAX(timestamp) AS last_ts
      FROM attendance_logs
      WHERE source = 'att2000_import' OR source_system = 'att2000'
    `);

    let fromDt;
    if (lastImport?.last_ts) {
      const lastDate = new Date(lastImport.last_ts);
      lastDate.setHours(lastDate.getHours() - safetyHours);
      fromDt = lastDate.toISOString().slice(0, 19).replace('T', ' ');
    } else {
      // Primera vez: últimas 48 horas
      const d = new Date();
      d.setHours(d.getHours() - 48);
      fromDt = d.toISOString().slice(0, 19).replace('T', ' ');
    }

    const toDt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    logger.info(`${label} Sync incremental att2000: ${fromDt} → ${toDt}`);

    // Crear sync run
    const [[src]] = await sequelize.query("SELECT id FROM source_systems WHERE code = 'att2000'");
    if (!src) {
      logger.warn(`${label} source_system att2000 no encontrado en DB`);
      return;
    }
    const [runId] = await sequelize.query(`
      INSERT INTO source_sync_runs
        (source_system_id, sync_type, entity_type, status, started_at, from_datetime, to_datetime)
      VALUES (?, 'incremental', 'punches', 'running', NOW(), ?, ?)
    `, { replacements: [src.id, fromDt, toDt] });

    // Leer de att2000
    const cols = await getTableColumns('CHECKINOUT');
    const checkType = pickCol(cols, 'CHECKTYPE',  { prefix: 'c.', alias: 'check_type' });
    const sensorId  = pickCol(cols, 'SENSORID',   { prefix: 'c.', alias: 'sensor_id' });
    const verifyCode= pickCol(cols, 'VERIFYCODE', { prefix: 'c.', alias: 'verify_code' });

    const punches = await queryAtt2000(`
      SELECT c.USERID AS source_user_id, c.CHECKTIME AS check_time,
             ${checkType}, ${sensorId}, ${verifyCode}
      FROM CHECKINOUT c
      WHERE c.CHECKTIME >= '${fromDt}' AND c.CHECKTIME <= '${toDt}'
      ORDER BY c.CHECKTIME
    `);

    if (punches.length === 0) {
      logger.info(`${label} Sin marcaciones nuevas`);
      await sequelize.query(
        "UPDATE source_sync_runs SET status='completed', finished_at=NOW(), total_read=0 WHERE id=?",
        { replacements: [runId] }
      );
      return;
    }

    // Mapa employee
    const [empMaps] = await sequelize.query(
      'SELECT source_user_id, employee_id FROM source_employee_map WHERE source_system_id = ?',
      { replacements: [src.id] }
    );
    const empMap = {};
    for (const m of empMaps) if (m.employee_id) empMap[String(m.source_user_id)] = m.employee_id;

    const normalizeType = (ct) => {
      if (!ct) return 'unknown';
      const t = String(ct).toUpperCase();
      if (t === 'I' || t === '0') return 'in';
      if (t === 'O' || t === '1') return 'out';
      return 'unknown';
    };

    let staged = 0, imported = 0, dupes = 0, errors = 0;

    for (const p of punches) {
      try {
        const empId = empMap[String(p.source_user_id)] || null;
        const normType = normalizeType(p.check_type);

        // Staging
        await sequelize.query(`
          INSERT IGNORE INTO attendance_import_staging
            (sync_run_id, source_system_id, source_user_id, check_time, check_type,
             sensor_id, verify_code, raw_data, normalized_type, employee_id, import_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, { replacements: [
          runId, src.id, String(p.source_user_id),
          p.check_time, p.check_type || null,
          p.sensor_id || null, p.verify_code || null,
          JSON.stringify(p), normType, empId
        ]});
        staged++;

        // Aplicar si tiene empleado y tipo válido
        if (empId && ['in','out'].includes(normType)) {
          const [[dup]] = await sequelize.query(
            'SELECT id FROM attendance_logs WHERE employee_id=? AND timestamp=? LIMIT 1',
            { replacements: [empId, p.check_time] }
          );
          if (!dup) {
            await sequelize.query(`
              INSERT INTO attendance_logs
                (employee_id, timestamp, type, source, source_system, raw_data, created_at)
              VALUES (?, ?, ?, 'att2000_import', 'att2000', ?, NOW())
            `, { replacements: [empId, p.check_time, normType, JSON.stringify(p)] });
            imported++;

            // Publicar en Redis para tiempo real
            await publishAttendance({
              source: 'att2000_sync',
              employeeCode: String(p.source_user_id),
              timestamp: new Date(p.check_time).toISOString(),
              type: normType,
            });
          } else {
            dupes++;
          }
        }
      } catch (e) {
        errors++;
        logger.error(`${label} Error procesando punch ${p.source_user_id}: ${e.message}`);
      }
    }

    await sequelize.query(`
      UPDATE source_sync_runs SET status='completed', finished_at=NOW(),
        total_read=?, total_inserted=?, total_skipped=?, total_errors=?
      WHERE id=?
    `, { replacements: [punches.length, imported, dupes, errors, runId] });

    logger.info(`${label} Completado: ${punches.length} leídos, ${imported} importados, ${dupes} dupes, ${errors} errores`);
  } catch (err) {
    logger.error(`${label} Error en sync incremental: ${err.message}`);
  }
}

// ─── Cron simple basado en setInterval ──────────────────────────
function parseCronToMs(cron) {
  // Soporte básico: */N * * * * → cada N minutos
  const m = cron.match(/^\*\/(\d+)\s+\*/);
  if (m) return parseInt(m[1]) * 60 * 1000;
  // Default: 5 minutos
  return 5 * 60 * 1000;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  const enabled = process.env.ATT2000_INCREMENTAL_ENABLED === 'true';
  if (!enabled) {
    logger.info('worker-sync: ATT2000_INCREMENTAL_ENABLED=false — esperando activación');
    // Mantener el proceso vivo pero sin hacer nada (PM2 lo gestiona)
    setInterval(() => {}, 60000);
    return;
  }

  logger.info('worker-sync iniciado');
  await sequelize.authenticate();
  await initRedis();

  const cron = process.env.ATT2000_INCREMENTAL_CRON || '*/5 * * * *';
  const intervalMs = parseCronToMs(cron);
  logger.info(`Sync incremental cada ${intervalMs / 60000} minutos`);

  // Primera ejecución inmediata
  await runIncrementalSync();

  // Ejecuciones periódicas
  setInterval(runIncrementalSync, intervalMs);
}

main().catch(err => {
  logger.error('worker-sync error fatal: ' + err.message);
  process.exit(1);
});
