'use strict';
/**
 * attendanceProcessor.js — Motor de Asistencia V2
 *
 * Soporta jornadas con múltiples marcaciones (ej: 4 punches = mañana + almuerzo + tarde).
 *
 * Algoritmo de segmentación (posición-par):
 *   Todos los punches del día se ordenan cronológicamente.
 *   Se emparejan por posición: (0→1), (2→3), (4→5), ...
 *   Cada par = un bloque de trabajo.
 *   El gap entre par 0 y par 1 = almuerzo (lunch_out → lunch_in).
 *
 * Tipos de marcación:
 *   1. CHECKTYPE explícito de att2000 ('in'/'out') — mayor prioridad.
 *   2. attendance_logs.type si fue asignado en sincronización.
 *   3. Inferencia por posición par/impar cuando type = 'unknown'.
 *   Si ninguno es confiable, se registra anomalía y se usa inferencia.
 */

const { sequelize } = require('../config/database');
const logger        = require('../config/logger');

const LONG_SHIFT_MINUTES  = 600; // > 10h → anomalía long_shift
const NO_LUNCH_MINUTES    = 300; // > 5h sin almuerzo → anomalía no_lunch_break
const DEDUP_WINDOW_MS     = 60 * 1000; // 60s → duplicados

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte timestamp MySQL "YYYY-MM-DD HH:mm:ss" a JS Date usando UTC
 * para evitar que la zona horaria del servidor afecte las diferencias.
 * Para strings ISO que ya tienen 'T' y 'Z' no añade nada. */
function tsToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const s = String(ts);
  if (s.includes('T') || s.endsWith('Z') || s.includes('+')) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

/** "HH:MM" de un timestamp o Date */
function fmtHHMM(ts) {
  if (!ts) return null;
  const d = tsToDate(ts);
  if (!d) return null;
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Deduplicación ────────────────────────────────────────────────────────────

/** Elimina marcaciones dentro de la misma ventana de 60s. */
function deduplicate(logs) {
  if (!logs.length) return [];
  const sorted = [...logs].sort((a, b) => tsToDate(a.timestamp) - tsToDate(b.timestamp));
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = tsToDate(result[result.length - 1].timestamp);
    const curr = tsToDate(sorted[i].timestamp);
    if ((curr - prev) >= DEDUP_WINDOW_MS) {
      result.push(sorted[i]);
    }
    // else: duplicado — se descarta silenciosamente (ya fue registrado como anomalía en etapa anterior)
  }
  return result;
}

// ─── Asignación de tipos ──────────────────────────────────────────────────────

/**
 * Asigna resolvedType ('in'|'out') y confidence ('explicit'|'inferred') a cada log.
 * Para 'unknown', usa posición par=in / impar=out en la secuencia completa.
 */
function assignTypes(logs) {
  const hasExplicit = logs.some(l => l.type === 'in' || l.type === 'out');

  if (!hasExplicit) {
    // Todo unknown: asignar por posición
    return logs.map((l, i) => ({
      ...l,
      resolvedType: i % 2 === 0 ? 'in' : 'out',
      confidence: 'inferred',
    }));
  }

  // Mix de explicit + unknown: unknown sigue la alternancia esperada
  // basada en el tipo del log anterior conocido.
  let nextExpected = 'in';
  return logs.map(l => {
    if (l.type === 'in' || l.type === 'out') {
      nextExpected = l.type === 'in' ? 'out' : 'in';
      return { ...l, resolvedType: l.type, confidence: 'explicit' };
    }
    const resolved = nextExpected;
    nextExpected = resolved === 'in' ? 'out' : 'in';
    return { ...l, resolvedType: resolved, confidence: 'inferred' };
  });
}

// ─── Construcción de segmentos ────────────────────────────────────────────────

/**
 * Empareja punches por posición: (0,1), (2,3), ...
 * Retorna { segments[], anomalies[] }.
 */
function buildSegments(typedLogs) {
  const segments  = [];
  const anomalies = [];
  const dupWindow = 60 * 1000;

  // Detectar duplicados antes de parear
  for (let i = 1; i < typedLogs.length; i++) {
    const diff = tsToDate(typedLogs[i].timestamp) - tsToDate(typedLogs[i - 1].timestamp);
    if (diff < dupWindow) {
      anomalies.push({
        anomaly_type: 'duplicate_punch',
        severity: 'warning',
        message: `Marcaciones en ventana de ${Math.round(diff / 1000)}s`,
        raw_payload: { log_ids: [typedLogs[i - 1].id, typedLogs[i].id] },
      });
    }
  }

  for (let i = 0; i < typedLogs.length; i += 2) {
    const inLog  = typedLogs[i];
    const outLog = typedLogs[i + 1] || null;
    const segIdx = Math.floor(i / 2);

    if (!outLog) {
      // Último punch sin par
      segments.push({
        segment_index: segIdx,
        in_log_id:     inLog.id,
        out_log_id:    null,
        in_at:         inLog.timestamp,
        out_at:        null,
        minutes:       null,
        confidence:    inLog.confidence,
        anomaly_code:  'missing_out',
      });
      anomalies.push({
        anomaly_type: 'missing_out',
        severity:     'warning',
        message:      `Entrada sin salida — ${fmtHHMM(inLog.timestamp)}`,
        raw_payload:  { in_log_id: inLog.id, in_at: inLog.timestamp },
      });
      continue;
    }

    const inTs  = tsToDate(inLog.timestamp);
    const outTs = tsToDate(outLog.timestamp);
    const mins  = Math.round((outTs - inTs) / 60000);

    const anomalyCode = mins <= 0 ? 'out_before_in' : null;
    if (anomalyCode) {
      anomalies.push({
        anomaly_type: 'out_before_in',
        severity:     'error',
        message:      `Salida (${fmtHHMM(outLog.timestamp)}) anterior a entrada (${fmtHHMM(inLog.timestamp)})`,
        raw_payload:  { in_log_id: inLog.id, out_log_id: outLog.id },
      });
    }

    const conf = inLog.confidence === 'explicit' && outLog.confidence === 'explicit'
      ? 'explicit'
      : 'inferred';

    segments.push({
      segment_index: segIdx,
      in_log_id:     inLog.id,
      out_log_id:    outLog.id,
      in_at:         inLog.timestamp,
      out_at:        outLog.timestamp,
      minutes:       Math.max(0, mins),
      confidence:    conf,
      anomaly_code:  anomalyCode,
    });
  }

  return { segments, anomalies };
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

function computeMetrics(segments) {
  const complete = segments.filter(s => s.in_at && s.out_at && s.minutes > 0);
  const workedMinutes = complete.reduce((s, seg) => s + seg.minutes, 0);

  const firstIn  = segments.length > 0 ? segments[0].in_at   : null;
  const lastOut  = segments.length > 0 ? segments[segments.length - 1].out_at : null;
  let lunchOut   = null;
  let lunchIn    = null;
  let breakMinutes = 0;

  if (segments.length >= 2 && segments[0].out_at && segments[1].in_at) {
    lunchOut     = segments[0].out_at;
    lunchIn      = segments[1].in_at;
    breakMinutes = Math.max(0, Math.round(
      (tsToDate(lunchIn) - tsToDate(lunchOut)) / 60000
    ));
  }

  return { workedMinutes, firstIn, lastOut, lunchOut, lunchIn, breakMinutes };
}

// ─── Anomalías de nivel jornada ───────────────────────────────────────────────

function detectDayAnomalies(metrics, segments) {
  const extra = [];

  if (metrics.workedMinutes > LONG_SHIFT_MINUTES) {
    extra.push({
      anomaly_type: 'long_shift',
      severity:     'warning',
      message:      `Jornada de ${Math.round(metrics.workedMinutes / 60 * 10) / 10}h (> ${LONG_SHIFT_MINUTES / 60}h)`,
      raw_payload:  { worked_minutes: metrics.workedMinutes },
    });
  }

  const completePairs = segments.filter(s => s.in_at && s.out_at).length;
  if (completePairs === 1 && metrics.workedMinutes > NO_LUNCH_MINUTES) {
    extra.push({
      anomaly_type: 'no_lunch_break',
      severity:     'info',
      message:      `Jornada de ${Math.round(metrics.workedMinutes / 60 * 10) / 10}h sin pausa de almuerzo registrada`,
      raw_payload:  { worked_minutes: metrics.workedMinutes },
    });
  }

  return extra;
}

// ─── DB writes ────────────────────────────────────────────────────────────────

async function upsertDailySummary({ date, employeeId, metrics, lateMinutes, status, anomalyCount }) {
  const haslunchCols = await _hasColumn('daily_summary', 'lunch_out');

  if (haslunchCols) {
    await sequelize.query(`
      INSERT INTO daily_summary
        (employee_id, date, first_in, lunch_out, lunch_in, last_out,
         worked_minutes, break_minutes, late_minutes, status, anomaly_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        first_in       = VALUES(first_in),
        lunch_out      = VALUES(lunch_out),
        lunch_in       = VALUES(lunch_in),
        last_out       = VALUES(last_out),
        worked_minutes = VALUES(worked_minutes),
        break_minutes  = VALUES(break_minutes),
        late_minutes   = VALUES(late_minutes),
        anomaly_count  = VALUES(anomaly_count),
        status         = CASE
          WHEN status IN ('holiday','weekend','permission') THEN status
          ELSE VALUES(status)
        END
    `, { replacements: [
      employeeId, date,
      metrics.firstIn, metrics.lunchOut, metrics.lunchIn, metrics.lastOut,
      metrics.workedMinutes, metrics.breakMinutes, lateMinutes, status, anomalyCount,
    ]});
  } else {
    // Fallback: sin columnas lunch/anomaly (migración 088 aún no aplicada)
    await sequelize.query(`
      INSERT INTO daily_summary
        (employee_id, date, first_in, last_out, worked_minutes, break_minutes, late_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        first_in       = VALUES(first_in),
        last_out       = VALUES(last_out),
        worked_minutes = VALUES(worked_minutes),
        break_minutes  = VALUES(break_minutes),
        late_minutes   = VALUES(late_minutes),
        status         = CASE
          WHEN status IN ('holiday','weekend','permission') THEN status
          ELSE VALUES(status)
        END
    `, { replacements: [
      employeeId, date,
      metrics.firstIn, metrics.lastOut,
      metrics.workedMinutes, metrics.breakMinutes, lateMinutes, status,
    ]});
  }
}

async function upsertSegments({ date, employeeId, segments }) {
  try {
    // Borrar segmentos previos para este empleado/día
    await sequelize.query(
      'DELETE FROM attendance_segments WHERE employee_id = ? AND work_date = ?',
      { replacements: [employeeId, date] }
    );
    for (const seg of segments) {
      await sequelize.query(`
        INSERT INTO attendance_segments
          (employee_id, work_date, segment_index, in_log_id, out_log_id,
           in_at, out_at, minutes, confidence, anomaly_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          in_log_id = VALUES(in_log_id), out_log_id = VALUES(out_log_id),
          in_at = VALUES(in_at), out_at = VALUES(out_at),
          minutes = VALUES(minutes), confidence = VALUES(confidence),
          anomaly_code = VALUES(anomaly_code)
      `, { replacements: [
        employeeId, date, seg.segment_index,
        seg.in_log_id || null, seg.out_log_id || null,
        seg.in_at || null, seg.out_at || null,
        seg.minutes ?? null, seg.confidence, seg.anomaly_code || null,
      ]});
    }
  } catch (err) {
    // attendance_segments no existe (migración 088 no aplicada) — continuar sin segmentos
    if (err.original?.errno !== 1146) logger.warn('upsertSegments:', err.message);
  }
}

async function upsertAnomalies({ date, employeeId, anomalies }) {
  if (!anomalies.length) return;
  try {
    // Borrar anomalías no resueltas previas para este día
    await sequelize.query(
      'DELETE FROM attendance_anomalies WHERE employee_id = ? AND work_date = ? AND resolved = 0',
      { replacements: [employeeId, date] }
    );
    for (const a of anomalies) {
      await sequelize.query(`
        INSERT INTO attendance_anomalies
          (employee_id, work_date, anomaly_type, severity, message, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `, { replacements: [
        employeeId, date,
        a.anomaly_type, a.severity, a.message || null,
        a.raw_payload ? JSON.stringify(a.raw_payload) : null,
      ]});
    }
  } catch (err) {
    if (err.original?.errno !== 1146) logger.warn('upsertAnomalies:', err.message);
  }
}

// Cache de columnas para evitar INFORMATION_SCHEMA repetidos
const _colCache = new Map();
async function _hasColumn(table, column) {
  const key = `${table}.${column}`;
  if (_colCache.has(key)) return _colCache.get(key);
  try {
    const [[row]] = await sequelize.query(
      'SELECT 1 AS exists_col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      { replacements: [table, column] }
    );
    const result = Boolean(row);
    _colCache.set(key, result);
    return result;
  } catch {
    return false;
  }
}

// ─── API principal ────────────────────────────────────────────────────────────

/**
 * Procesa la jornada completa de un empleado para una fecha dada.
 * Lee attendance_logs, computa segmentos, métricas y anomalías,
 * y escribe daily_summary + attendance_segments + attendance_anomalies.
 */
async function processAttendanceDay({ date, employeeId }) {
  // 1. Fetch logs
  const [logs] = await sequelize.query(`
    SELECT id, timestamp, type, source, device_id
    FROM attendance_logs
    WHERE employee_id = ? AND DATE(timestamp) = ?
    ORDER BY timestamp ASC
  `, { replacements: [employeeId, date] });

  if (!logs.length) {
    // Sin datos → ausente
    await sequelize.query(`
      INSERT INTO daily_summary (employee_id, date, status)
      VALUES (?, ?, 'absent')
      ON DUPLICATE KEY UPDATE
        status = CASE
          WHEN status IN ('holiday','weekend','permission') THEN status
          ELSE 'absent'
        END
    `, { replacements: [employeeId, date] });
    return { segments: [], metrics: null, anomalies: [] };
  }

  // 2. Deduplicar
  const deduped = deduplicate(logs);
  const dupCount = logs.length - deduped.length;

  // 3. Asignar tipos
  const typed = assignTypes(deduped);

  // 4. Construir segmentos
  const { segments, anomalies: segAnomalies } = buildSegments(typed);

  // 5. Métricas
  const metrics = computeMetrics(segments);

  // 6. Anomalías de jornada
  const dayAnomalies = detectDayAnomalies(metrics, segments);
  if (dupCount > 0) {
    dayAnomalies.push({
      anomaly_type: 'duplicate_punch',
      severity:     'warning',
      message:      `${dupCount} marcación(es) duplicada(s) eliminada(s) dentro de ventana de ${DEDUP_WINDOW_MS / 1000}s`,
      raw_payload:  { original_count: logs.length, after_dedup: deduped.length },
    });
  }
  const allAnomalies = [...segAnomalies, ...dayAnomalies];

  // 7. Calcular atraso respecto al horario del empleado
  let lateMinutes = 0;
  try {
    const [[sched]] = await sequelize.query(`
      SELECT s.check_in, COALESCE(s.tolerance_in, 0) AS tolerance_in
      FROM employees e
      LEFT JOIN schedules s ON e.schedule_id = s.id
      WHERE e.id = ?
    `, { replacements: [employeeId] });

    if (sched?.check_in && metrics.firstIn) {
      const scheduledTs = tsToDate(`${date} ${sched.check_in}`);
      const toleranceMs = (sched.tolerance_in || 0) * 60 * 1000;
      const firstInTs   = tsToDate(metrics.firstIn);
      lateMinutes = Math.max(0, Math.round((firstInTs - scheduledTs - toleranceMs) / 60000));
    }
  } catch {
    // Sin horario asignado — sin cálculo de atraso
  }

  // 8. Estado
  let status = 'present';
  if (!metrics.firstIn) {
    status = 'absent';
  } else if (lateMinutes > 0) {
    status = 'late';
  }

  // 9. Upsert DB
  await upsertDailySummary({ date, employeeId, metrics, lateMinutes, status, anomalyCount: allAnomalies.length });
  await upsertSegments({ date, employeeId, segments });
  await upsertAnomalies({ date, employeeId, anomalies: allAnomalies });

  return {
    segments,
    metrics: { ...metrics, lateMinutes, status, anomalyCount: allAnomalies.length },
    anomalies: allAnomalies,
  };
}

/**
 * Procesa todos los empleados con marcaciones para una fecha dada.
 * Reemplaza bulkRecalcDailySummary para jornadas multi-punch.
 */
async function bulkProcessDay(date) {
  const [empRows] = await sequelize.query(
    'SELECT DISTINCT employee_id FROM attendance_logs WHERE DATE(timestamp) = ?',
    { replacements: [date] }
  );

  let processed = 0, errors = 0;
  for (const { employee_id } of empRows) {
    try {
      await processAttendanceDay({ date, employeeId: employee_id });
      processed++;
    } catch (err) {
      logger.error(`V2 processDay ${date} emp ${employee_id}:`, err.message);
      errors++;
    }
  }

  logger.info(`♻️  V2 attendance procesado: ${processed} empleados, ${errors} errores — ${date}`);
  return { date, processed, errors };
}

module.exports = {
  processAttendanceDay,
  bulkProcessDay,
  // Exponer helpers para tests
  deduplicate,
  assignTypes,
  buildSegments,
  computeMetrics,
  detectDayAnomalies,
  tsToDate,
};
