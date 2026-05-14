/**
 * worker-sync-att2000 — Sincronización incremental att2000 → MySQL
 *
 * Corre como proceso PM2 separado (cwd: api/).
 * Usa las funciones de consulta seguras de att2000.js (no queryAtt2000 directo).
 * Lee nuevas marcaciones desde el último CHECKTIME importado con ventana de seguridad.
 *
 * Variables de entorno:
 *   ATT2000_INCREMENTAL_ENABLED  = true|false (default: false)
 *   ATT2000_INCREMENTAL_CRON     = cada-5-minutos (cron expression, default: every 5 min)
 *   ATT2000_SAFETY_WINDOW_HOURS  = 24
 *   SERVICE_NAME                 = worker-sync-att2000
 */

require('dotenv').config();
process.env.SERVICE_NAME = 'worker-sync-att2000';

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
    logger.warn('Redis no disponible — worker-sync-att2000 funcionará sin pubsub: ' + err.message);
  }
}

// ─── Publicar eventos en Redis ───────────────────────────────────
async function publish(channel, payload) {
  if (!redis?.isReady) return;
  try {
    await redis.publish(channel, JSON.stringify(payload));
  } catch {}
}

// ─── Normalizar tipo de marcación ────────────────────────────────
function normalizeType(ct) {
  if (!ct) return 'unknown';
  const t = String(ct).toUpperCase();
  if (t === 'I' || t === '0') return 'in';
  if (t === 'O' || t === '1') return 'out';
  return 'unknown';
}

// ─── Sincronización incremental ──────────────────────────────────
async function runIncrementalSync() {
  const label = `[sync-att2000-${Date.now()}]`;
  let runId = null;
  let totalRead = 0, totalInserted = 0, totalSkipped = 0, totalErrors = 0;

  try {
    // 1. Verificar source_mode — si es 'direct_only', skip
    const [[modeSetting]] = await sequelize.query(
      "SELECT `value` FROM settings WHERE `key` = 'attendance.source_mode'"
    );
    const mode = modeSetting?.value || 'legacy_att2000';
    if (mode === 'direct_only') {
      logger.info(`${label} source_mode=direct_only — sync omitido`);
      return;
    }

    // 2. Verificar att2000.incremental_enabled desde settings
    const [[enabledSetting]] = await sequelize.query(
      "SELECT `value` FROM settings WHERE `key` = 'att2000.incremental_enabled'"
    );
    const dbEnabled = enabledSetting?.value;
    if (dbEnabled === 'false' || dbEnabled === '0') {
      logger.info(`${label} att2000.incremental_enabled=false en settings — sync omitido`);
      return;
    }

    const { fetchAttPunchesSince } = require('./src/config/att2000');
    const safetyHours = parseInt(process.env.ATT2000_SAFETY_WINDOW_HOURS || '24');
    const batchLimit  = parseInt(process.env.ATT2000_BATCH_LIMIT || '5000');

    // 3. Obtener último timestamp importado con ventana de seguridad
    const [[lastImport]] = await sequelize.query(`
      SELECT MAX(timestamp) AS last_ts
      FROM attendance_logs
      WHERE source = 'att2000_import' OR source_system = 'att2000'
    `);

    let since;
    if (lastImport?.last_ts) {
      const lastDate = new Date(lastImport.last_ts);
      lastDate.setHours(lastDate.getHours() - safetyHours);
      since = lastDate;
    } else {
      // Primera vez: últimas 48 horas
      const d = new Date();
      d.setHours(d.getHours() - 48);
      since = d;
    }

    const sinceIso = since.toISOString().slice(0, 19).replace('T', ' ');
    const toDt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    logger.info(`${label} Sync incremental att2000: desde ${sinceIso}`);

    // Obtener source_system att2000
    const [[src]] = await sequelize.query(
      "SELECT id FROM source_systems WHERE code = 'att2000'"
    );
    if (!src) {
      logger.warn(`${label} source_system att2000 no encontrado en DB`);
      return;
    }

    // Crear sync run
    const [insertedRunId] = await sequelize.query(`
      INSERT INTO source_sync_runs
        (source_system_id, sync_type, entity_type, status, started_at, from_datetime, to_datetime)
      VALUES (?, 'incremental', 'punches', 'running', NOW(), ?, ?)
    `, { replacements: [src.id, sinceIso, toDt] });
    runId = insertedRunId;

    // 4. Obtener marcaciones desde att2000 (función segura)
    const punches = await fetchAttPunchesSince({ since, limit: batchLimit });
    totalRead = punches.length;

    if (punches.length === 0) {
      logger.info(`${label} Sin marcaciones nuevas desde ${sinceIso}`);
      await sequelize.query(
        "UPDATE source_sync_runs SET status='completed', finished_at=NOW(), total_read=0 WHERE id=?",
        { replacements: [runId] }
      );
      await publish('sync:att2000_completed', { runId, totalRead: 0, label });
      return;
    }

    logger.info(`${label} ${punches.length} marcaciones leídas desde att2000`);

    // Cargar mapa de empleados
    const [empMaps] = await sequelize.query(
      'SELECT source_user_id, employee_id FROM source_employee_map WHERE source_system_id = ?',
      { replacements: [src.id] }
    );
    const empMap = {};
    for (const m of empMaps) {
      if (m.employee_id) empMap[String(m.source_user_id)] = m.employee_id;
    }

    // 5. Procesar cada marcación
    for (const p of punches) {
      try {
        const sourceUserId = String(p.USERID);
        const checkTime    = p.CHECKTIME;
        const checkType    = p.CHECKTYPE || null;
        const sensorId     = p.SENSORID  || null;
        const verifyCode   = p.VERIFYCODE || null;
        const normType     = normalizeType(checkType);
        const empId        = empMap[sourceUserId] || null;

        // 5a. Si no tiene mapeo: insertar en unknown_attendance_events
        if (!empId) {
          await sequelize.query(`
            INSERT IGNORE INTO unknown_attendance_events
              (source_system_id, source_user_id, check_time, check_type, sensor_id,
               verify_code, raw_data, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
          `, { replacements: [
            src.id, sourceUserId, checkTime, checkType,
            sensorId, verifyCode, JSON.stringify(p)
          ]});
          totalSkipped++;
          continue;
        }

        // 5b. Insertar en staging (ON DUPLICATE KEY IGNORE)
        await sequelize.query(`
          INSERT IGNORE INTO attendance_import_staging
            (sync_run_id, source_system_id, source_user_id, check_time, check_type,
             sensor_id, verify_code, raw_data, normalized_type, employee_id, import_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, { replacements: [
          runId, src.id, sourceUserId, checkTime, checkType,
          sensorId, verifyCode, JSON.stringify(p), normType, empId
        ]});

        // 5c. Si staging OK: insertar en attendance_logs (deduplicar)
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
            totalInserted++;

            // Publicar en Redis para tiempo real
            await publish('attendance:new', {
              source:        'att2000_sync',
              employeeId:    empId,
              sourceUserId:  sourceUserId,
              timestamp:     new Date(checkTime).toISOString(),
              type:          normType,
            });
          } else {
            totalSkipped++;
          }
        } else {
          totalSkipped++;
        }
      } catch (e) {
        totalErrors++;
        logger.error(`${label} Error procesando punch ${p.USERID}: ${e.message}`);
      }
    }

    // 6. Actualizar source_sync_runs con totales
    await sequelize.query(`
      UPDATE source_sync_runs
      SET status='completed', finished_at=NOW(),
          total_read=?, total_inserted=?, total_skipped=?, total_errors=?
      WHERE id=?
    `, { replacements: [totalRead, totalInserted, totalSkipped, totalErrors, runId] });

    logger.info(`${label} Completado: ${totalRead} leídos, ${totalInserted} insertados, ${totalSkipped} omitidos, ${totalErrors} errores`);

    // 7. Publicar evento de completado en Redis
    await publish('sync:att2000_completed', {
      runId, label, totalRead, totalInserted, totalSkipped, totalErrors,
    });

  } catch (err) {
    logger.error(`${label} Error en sync incremental att2000: ${err.message}`);

    // Actualizar run a fallido si se creó
    if (runId) {
      await sequelize.query(
        "UPDATE source_sync_runs SET status='failed', finished_at=NOW(), total_read=?, total_inserted=?, total_skipped=?, total_errors=? WHERE id=?",
        { replacements: [totalRead, totalInserted, totalSkipped, totalErrors + 1, runId] }
      ).catch(() => {});
    }

    // 7. Publicar evento de fallo en Redis
    await publish('sync:att2000_failed', {
      runId, label, error: err.message,
      totalRead, totalInserted, totalSkipped, totalErrors,
    });
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
    logger.info('worker-sync-att2000: ATT2000_INCREMENTAL_ENABLED=false — proceso inactivo (esperando activación)');
    // Mantener el proceso vivo pero sin hacer nada (PM2 lo gestiona)
    setInterval(() => {}, 60000);
    return;
  }

  logger.info('worker-sync-att2000 iniciado');
  await sequelize.authenticate();
  await initRedis();

  const cron = process.env.ATT2000_INCREMENTAL_CRON || '*/5 * * * *';
  const intervalMs = parseCronToMs(cron);
  logger.info(`Sync att2000 incremental cada ${intervalMs / 60000} minutos`);

  // Primera ejecución inmediata
  await runIncrementalSync();

  // Ejecuciones periódicas
  setInterval(runIncrementalSync, intervalMs);
}

main().catch(err => {
  logger.error('worker-sync-att2000 error fatal: ' + err.message);
  process.exit(1);
});
