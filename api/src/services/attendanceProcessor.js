'use strict';
/**
 * attendanceProcessor.js — Motor de Asistencia V2
 *
 * Soporta jornadas con múltiples marcaciones y políticas configurables de almuerzo.
 *
 * Algoritmo de segmentación (posición-par):
 *   Todos los punches del día se ordenan cronológicamente.
 *   Se emparejan por posición: (0→1), (2→3), (4→5), ...
 *   El gap entre par 0 y par 1 = almuerzo (lunch_out → lunch_in).
 *
 * Aplicación de política:
 *   - Si hay 2 marcaciones (jornada corrida):
 *       policy.auto_deduct_break = false  → worked = gross (TODO: Caso A y D)
 *       policy.auto_deduct_break = true   → worked = gross − break_minutes si gross ≥ umbral (Caso C)
 *   - Si hay 4+ marcaciones (almuerzo marcado):
 *       worked = Σ segmentos de trabajo (almuerzo excluido) — siempre (Caso B)
 *
 * Tipos de marcación (prioridad):
 *   1. attendance_logs.type = 'in'/'out' (explícito desde att2000 CHECKTYPE)
 *   2. Inferencia por posición par/impar cuando type = 'unknown'
 */

const { sequelize } = require('../config/database');
const logger        = require('../config/logger');

const LONG_SHIFT_MINUTES = 600; // > 10h → anomalía long_shift
const DEDUP_WINDOW_MS    = 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte "YYYY-MM-DD HH:mm:ss" → JS Date tratando el valor como UTC.
 *  Strings ISO con T/Z se parsean directamente. */
function tsToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const s = String(ts);
  if (s.includes('T') || s.endsWith('Z') || s.includes('+')) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

function fmtHHMM(ts) {
  const d = tsToDate(ts);
  if (!d) return null;
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

/**
 * Calcula el offset en ms del timezone de Sequelize (ej: '-03:00' → -10800000).
 * Sequelize aplica este offset al leer DATETIME de MySQL → Date object UTC.
 * Necesitamos invertirlo para recuperar el string original de MySQL.
 */
const _seqTzOffsetMs = (() => {
  const tz = sequelize.options?.timezone;
  if (!tz || tz === 'Z' || tz === 'UTC' || tz === '+00:00') return 0;
  const m = String(tz).match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (parseInt(m[2]) * 60 + parseInt(m[3])) * 60 * 1000;
})();

/**
 * Devuelve "YYYY-MM-DD HH:mm:ss" exactamente como está en MySQL, sin aplicar
 * conversión de timezone.
 *
 * Problema a resolver: Sequelize con timezone='-03:00' convierte el DATETIME
 * '06:47:46' a Date(09:47:46Z). Cuando mysql2 inserta ese Date object usa
 * getHours() del proceso Node.js (no el timezone de Sequelize), produciendo drift.
 *
 * Solución: invertir el offset de Sequelize para recuperar el string original.
 */
function formatMysqlDateTimeLocal(value) {
  if (!value) return null;
  // String MySQL directo — devolver tal cual
  if (typeof value === 'string') {
    return value.replace('T', ' ').slice(0, 19);
  }
  if (value instanceof Date) {
    // Invertir el offset que Sequelize aplicó al leer: Date(UTC) - seqOffset → original local
    const ms = value.getTime() + _seqTzOffsetMs;
    const d  = new Date(ms);
    const p  = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }
  return null;
}

// ─── Deduplicación ────────────────────────────────────────────────────────────

function deduplicate(logs) {
  if (!logs.length) return [];
  const sorted = [...logs].sort((a, b) => tsToDate(a.timestamp) - tsToDate(b.timestamp));
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if ((tsToDate(sorted[i].timestamp) - tsToDate(out[out.length - 1].timestamp)) >= DEDUP_WINDOW_MS) {
      out.push(sorted[i]);
    }
  }
  return out;
}

// ─── Asignación de tipos ──────────────────────────────────────────────────────

function assignTypes(logs) {
  const hasExplicit = logs.some(l => l.type === 'in' || l.type === 'out');

  if (!hasExplicit) {
    return logs.map((l, i) => ({ ...l, resolvedType: i % 2 === 0 ? 'in' : 'out', confidence: 'inferred' }));
  }

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
 * Empareja por posición: (0,1), (2,3), …
 * Devuelve solo segmentos de trabajo; el gap entre seg[0].out y seg[1].in es el break.
 */
function buildSegments(typedLogs) {
  const segments  = [];
  const anomalies = [];

  for (let i = 0; i < typedLogs.length; i += 2) {
    const inLog  = typedLogs[i];
    const outLog = typedLogs[i + 1] || null;
    // segment_index empieza en 1
    const segIdx = Math.floor(i / 2) + 1;
    // Normalizar timestamps a string MySQL sin offset de timezone
    const inAtStr  = formatMysqlDateTimeLocal(inLog.timestamp);
    const outAtStr = outLog ? formatMysqlDateTimeLocal(outLog.timestamp) : null;

    if (!outLog) {
      segments.push({
        segment_index: segIdx,
        segment_type:  'incomplete',
        in_log_id:     inLog.id,
        out_log_id:    null,
        in_at:         inAtStr,
        out_at:        null,
        gross_minutes: null,
        worked_minutes: null,
        confidence:    inLog.confidence,
        anomaly_code:  'missing_out',
      });
      anomalies.push({ anomaly_type: 'missing_out', severity: 'warning',
        message: `Entrada sin salida — ${fmtHHMM(inAtStr)}`,
        raw_payload: { in_log_id: inLog.id, in_at: inAtStr } });
      continue;
    }

    const inTs  = tsToDate(inAtStr);
    const outTs = tsToDate(outAtStr);
    const mins  = Math.round((outTs - inTs) / 60000);
    const outBeforeIn = mins <= 0;

    if (outBeforeIn) {
      anomalies.push({ anomaly_type: 'out_before_in', severity: 'error',
        message: `Salida (${fmtHHMM(outAtStr)}) anterior a entrada (${fmtHHMM(inAtStr)})`,
        raw_payload: { in_log_id: inLog.id, out_log_id: outLog.id } });
    }

    segments.push({
      segment_index:  segIdx,
      segment_type:   outBeforeIn ? 'incomplete' : 'work',
      in_log_id:      inLog.id,
      out_log_id:     outLog.id,
      in_at:          inAtStr,
      out_at:         outAtStr,
      gross_minutes:  Math.max(0, mins),
      worked_minutes: Math.max(0, mins),
      confidence:     inLog.confidence === 'explicit' && outLog.confidence === 'explicit' ? 'explicit' : 'inferred',
      anomaly_code:   outBeforeIn ? 'out_before_in' : null,
    });
  }

  return { segments, anomalies };
}

// ─── Métricas base (antes de aplicar política) ───────────────────────────────

function computeBaseMetrics(segments) {
  const workSegs    = segments.filter(s => s.segment_type === 'work' && s.gross_minutes > 0);
  const sumSegMins  = workSegs.reduce((s, seg) => s + seg.gross_minutes, 0);
  const firstIn     = segments.length > 0 ? segments[0].in_at    : null;
  const lastOut     = segments.length > 0 ? segments[segments.length - 1].out_at : null;

  // gross = span total firstIn → lastOut
  let grossMinutes = 0;
  if (firstIn && lastOut) {
    grossMinutes = Math.max(0, Math.round((tsToDate(lastOut) - tsToDate(firstIn)) / 60000));
  }

  let lunchOut = null, lunchIn = null, lunchMinutes = 0;
  if (segments.length >= 2 && segments[0].out_at && segments[1].in_at) {
    lunchOut     = segments[0].out_at;
    lunchIn      = segments[1].in_at;
    lunchMinutes = Math.max(0, Math.round((tsToDate(lunchIn) - tsToDate(lunchOut)) / 60000));
  }

  return { grossMinutes, sumSegMins, firstIn, lastOut, lunchOut, lunchIn, lunchMinutes };
}

// ─── Aplicar política de jornada ──────────────────────────────────────────────

/**
 * Aplica la política de trabajo y devuelve métricas finales.
 *
 * Reglas:
 *  - 4+ marcaciones → lunch fue marcado → worked = sumSegMins, break = lunchMinutes
 *  - 2 marcaciones + auto_deduct=false → worked = gross, break = 0  (jornada corrida)
 *  - 2 marcaciones + auto_deduct=true  → worked = gross − break_minutes (si aplica umbral), break = break_minutes
 */
function applyPolicy(baseMetrics, segments, policy) {
  const { grossMinutes, sumSegMins, firstIn, lastOut, lunchOut, lunchIn, lunchMinutes } = baseMetrics;
  const workSegsCount = segments.filter(s => s.segment_type === 'work').length;

  let workedMinutes = 0;
  let breakMinutes  = 0;
  let breakSource   = 'none';

  if (lunchOut && lunchIn) {
    // Almuerzo marcado explícitamente → usar suma de segmentos
    workedMinutes = sumSegMins;
    breakMinutes  = lunchMinutes;
    breakSource   = 'marked_lunch';
  } else if (workSegsCount <= 1) {
    // Jornada corrida (1 o 0 segmentos completos)
    if (policy.auto_deduct_break &&
        policy.break_minutes > 0 &&
        grossMinutes >= (policy.apply_break_after_minutes || 0)) {
      // Caso C: descuento automático configurado
      workedMinutes = Math.max(0, grossMinutes - policy.break_minutes);
      breakMinutes  = policy.break_minutes;
      breakSource   = 'auto_deduct';
    } else {
      // Caso A/D: sin descuento automático → todo cuenta como trabajado
      workedMinutes = grossMinutes;
      breakMinutes  = 0;
      breakSource   = 'none';
    }
  } else {
    // Múltiples segmentos sin lunch marcado explícito (raro)
    workedMinutes = sumSegMins;
    breakMinutes  = Math.max(0, grossMinutes - sumSegMins);
    breakSource   = 'gap';
  }

  return { workedMinutes, breakMinutes, breakSource, grossMinutes, firstIn, lastOut, lunchOut, lunchIn };
}

// ─── Anomalías de nivel jornada ───────────────────────────────────────────────

function detectDayAnomalies(finalMetrics, segments, policy) {
  const extra = [];
  const { workedMinutes, grossMinutes, lunchOut } = finalMetrics;
  const workSegsCount = segments.filter(s => s.segment_type === 'work').length;

  if (grossMinutes > LONG_SHIFT_MINUTES) {
    extra.push({ anomaly_type: 'long_shift', severity: 'warning',
      message: `Jornada de ${Math.round(grossMinutes / 60 * 10) / 10}h (> ${LONG_SHIFT_MINUTES / 60}h)`,
      raw_payload: { gross_minutes: grossMinutes } });
  }

  // no_lunch_break: solo si la política lo requiere o si la jornada es larga sin almuerzo
  if (!lunchOut && workSegsCount === 1) {
    if (policy.require_lunch_punch) {
      extra.push({ anomaly_type: 'no_lunch_break', severity: 'warning',
        message: 'La política requiere marcación de almuerzo',
        raw_payload: { gross_minutes: grossMinutes } });
    }
  }

  if (policy.max_daily_minutes > 0 && workedMinutes > policy.max_daily_minutes) {
    extra.push({ anomaly_type: 'long_shift', severity: 'warning',
      message: `Horas trabajadas (${Math.round(workedMinutes / 60 * 10) / 10}h) exceden el máximo configurado`,
      raw_payload: { worked_minutes: workedMinutes, max: policy.max_daily_minutes } });
  }

  return extra;
}

// ─── DB writes ────────────────────────────────────────────────────────────────

// Memoize column checks (reset en tests via _resetColCache)
const _colCache = new Map();
async function _hasColumn(table, column) {
  const key = `${table}.${column}`;
  if (_colCache.has(key)) return _colCache.get(key);
  try {
    const [[row]] = await sequelize.query(
      'SELECT 1 AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      { replacements: [table, column] }
    );
    const val = Boolean(row);
    _colCache.set(key, val);
    return val;
  } catch { return false; }
}

async function upsertDailySummary({ date, employeeId, finalMetrics, lateMinutes, status, anomalyCount, policy }) {
  const hasLunch  = await _hasColumn('daily_summary', 'lunch_out');
  const hasGross  = await _hasColumn('daily_summary', 'gross_minutes');
  const hasPolicy = await _hasColumn('daily_summary', 'policy_id');

  const { workedMinutes, breakMinutes, grossMinutes, firstIn, lastOut, lunchOut, lunchIn } = finalMetrics;

  // Build column list dynamically based on what's available
  const cols   = ['employee_id', 'date', 'first_in', 'last_out', 'worked_minutes', 'break_minutes', 'late_minutes', 'status'];
  const vals   = [employeeId, date, formatMysqlDateTimeLocal(firstIn), formatMysqlDateTimeLocal(lastOut), workedMinutes, breakMinutes, lateMinutes, status];
  const update = [
    'first_in       = VALUES(first_in)',
    'last_out       = VALUES(last_out)',
    'worked_minutes = VALUES(worked_minutes)',
    'break_minutes  = VALUES(break_minutes)',
    'late_minutes   = VALUES(late_minutes)',
    "status = CASE WHEN status IN ('holiday','weekend','permission') THEN status ELSE VALUES(status) END",
  ];

  if (hasLunch) {
    cols.push('lunch_out', 'lunch_in');
    vals.push(formatMysqlDateTimeLocal(lunchOut), formatMysqlDateTimeLocal(lunchIn));
    update.push('lunch_out = VALUES(lunch_out)', 'lunch_in = VALUES(lunch_in)');
  }
  if (hasGross) {
    cols.push('gross_minutes');
    vals.push(grossMinutes);
    update.push('gross_minutes = VALUES(gross_minutes)');
  }
  if (hasPolicy) {
    cols.push('policy_id', 'policy_source');
    vals.push(policy?.id ?? null, policy?.source ?? null);
    update.push('policy_id = VALUES(policy_id)', 'policy_source = VALUES(policy_source)');
  }
  if (await _hasColumn('daily_summary', 'anomaly_count')) {
    cols.push('anomaly_count');
    vals.push(anomalyCount);
    update.push('anomaly_count = VALUES(anomaly_count)');
  }

  const placeholders = cols.map(() => '?').join(', ');
  await sequelize.query(
    `INSERT INTO daily_summary (${cols.join(', ')}) VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${update.join(', ')}`,
    { replacements: vals }
  );
}

async function upsertSegments({ date, employeeId, segments }) {
  try {
    await sequelize.query(
      'DELETE FROM attendance_segments WHERE employee_id = ? AND work_date = ?',
      { replacements: [employeeId, date] }
    );
    const hasSegType    = await _hasColumn('attendance_segments', 'segment_type');
    const hasWorkedMins = await _hasColumn('attendance_segments', 'worked_minutes');

    for (const seg of segments) {
      if (hasSegType && hasWorkedMins) {
        await sequelize.query(`
          INSERT INTO attendance_segments
            (employee_id, work_date, segment_index, segment_type, in_log_id, out_log_id,
             in_at, out_at, gross_minutes, worked_minutes, confidence, anomaly_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            segment_type = VALUES(segment_type),
            in_log_id = VALUES(in_log_id), out_log_id = VALUES(out_log_id),
            in_at = VALUES(in_at), out_at = VALUES(out_at),
            gross_minutes = VALUES(gross_minutes), worked_minutes = VALUES(worked_minutes),
            confidence = VALUES(confidence), anomaly_code = VALUES(anomaly_code)
        `, { replacements: [
          employeeId, date, seg.segment_index, seg.segment_type || 'work',
          seg.in_log_id || null, seg.out_log_id || null,
          formatMysqlDateTimeLocal(seg.in_at) || null, formatMysqlDateTimeLocal(seg.out_at) || null,
          seg.gross_minutes ?? null, seg.worked_minutes ?? null,
          seg.confidence, seg.anomaly_code || null,
        ]});
      } else {
        // Fallback: migración 088 pero sin 089
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
          formatMysqlDateTimeLocal(seg.in_at) || null, formatMysqlDateTimeLocal(seg.out_at) || null,
          seg.gross_minutes ?? null, seg.confidence, seg.anomaly_code || null,
        ]});
      }
    }
  } catch (err) {
    if (err.original?.errno !== 1146) logger.warn('upsertSegments:', err.message);
  }
}

async function upsertAnomalies({ date, employeeId, anomalies }) {
  if (!anomalies.length) return;
  try {
    await sequelize.query(
      'DELETE FROM attendance_anomalies WHERE employee_id = ? AND work_date = ? AND resolved = 0',
      { replacements: [employeeId, date] }
    );
    for (const a of anomalies) {
      await sequelize.query(`
        INSERT INTO attendance_anomalies (employee_id, work_date, anomaly_type, severity, message, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `, { replacements: [
        employeeId, date, a.anomaly_type, a.severity,
        a.message || null, a.raw_payload ? JSON.stringify(a.raw_payload) : null,
      ]});
    }
  } catch (err) {
    if (err.original?.errno !== 1146) logger.warn('upsertAnomalies:', err.message);
  }
}

// ─── API principal ────────────────────────────────────────────────────────────

async function processAttendanceDay({ date, employeeId }) {
  const { resolvePolicy } = require('./attendancePolicyResolver');

  // 1. Fetch logs
  const [logs] = await sequelize.query(`
    SELECT id, timestamp, type, source, device_id
    FROM attendance_logs WHERE employee_id = ? AND DATE(timestamp) = ?
    ORDER BY timestamp ASC
  `, { replacements: [employeeId, date] });

  if (!logs.length) {
    await sequelize.query(`
      INSERT INTO daily_summary (employee_id, date, status) VALUES (?, ?, 'absent')
      ON DUPLICATE KEY UPDATE
        status = CASE WHEN status IN ('holiday','weekend','permission') THEN status ELSE 'absent' END
    `, { replacements: [employeeId, date] });
    return { segments: [], finalMetrics: null, anomalies: [], policy: null };
  }

  // 2. Normalizar timestamps (Sequelize puede devolver Date objects), deduplicar, asignar tipos
  const normalizedLogs = logs.map(l => ({ ...l, timestamp: formatMysqlDateTimeLocal(l.timestamp) }));
  const deduped = deduplicate(normalizedLogs);
  const typed   = assignTypes(deduped);
  const { segments, anomalies: segAnomalies } = buildSegments(typed);

  // 3. Resolver política
  const policy = await resolvePolicy(employeeId);

  // 4. Métricas base y aplicar política
  const base        = computeBaseMetrics(segments);
  const finalMetrics = applyPolicy(base, segments, policy);

  // 5. Anomalías de jornada
  const dayAnomalies = detectDayAnomalies(finalMetrics, segments, policy);
  const dupCount     = logs.length - deduped.length;
  if (dupCount > 0) {
    dayAnomalies.push({ anomaly_type: 'duplicate_punch', severity: 'warning',
      message: `${dupCount} marcación(es) duplicada(s) descartada(s)`,
      raw_payload: { original_count: logs.length, after_dedup: deduped.length } });
  }
  const allAnomalies = [...segAnomalies, ...dayAnomalies];

  // 6. Calcular atraso respecto al horario
  let lateMinutes = 0;
  try {
    const [[sched]] = await sequelize.query(`
      SELECT s.check_in, COALESCE(s.tolerance_in, 0) AS tolerance_in
      FROM employees e LEFT JOIN schedules s ON e.schedule_id = s.id WHERE e.id = ?
    `, { replacements: [employeeId] });
    if (sched?.check_in && finalMetrics.firstIn) {
      const scheduled = tsToDate(`${date} ${sched.check_in}`);
      const tolerMs   = (sched.tolerance_in || 0) * 60 * 1000;
      lateMinutes     = Math.max(0, Math.round((tsToDate(finalMetrics.firstIn) - scheduled - tolerMs) / 60000));
    }
  } catch { /* sin horario */ }

  // 7. Estado
  let status = finalMetrics.firstIn ? (lateMinutes > 0 ? 'late' : 'present') : 'absent';

  // 8. Guardar
  await upsertDailySummary({ date, employeeId, finalMetrics, lateMinutes, status, anomalyCount: allAnomalies.length, policy });
  await upsertSegments({ date, employeeId, segments });
  await upsertAnomalies({ date, employeeId, anomalies: allAnomalies });

  return {
    segments,
    finalMetrics: { ...finalMetrics, lateMinutes, status, anomalyCount: allAnomalies.length },
    anomalies: allAnomalies,
    policy,
  };
}

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
  // Expuestos para tests
  deduplicate,
  assignTypes,
  buildSegments,
  computeBaseMetrics,
  applyPolicy,
  detectDayAnomalies,
  tsToDate,
  formatMysqlDateTimeLocal,
  _resetColCache: () => _colCache.clear(),
};
