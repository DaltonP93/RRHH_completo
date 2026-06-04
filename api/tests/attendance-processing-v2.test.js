'use strict';
/**
 * Tests para attendanceProcessor.js — Motor V2 multi-punch con almuerzo y políticas.
 * No requiere MySQL real: mockea sequelize y usa las funciones puras.
 */

jest.mock('../src/config/database', () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock('../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const {
  deduplicate,
  assignTypes,
  buildSegments,
  computeBaseMetrics,
  applyPolicy,
  detectDayAnomalies,
  tsToDate,
  formatMysqlDateTimeLocal,
} = require('../src/services/attendanceProcessor');

const DEFAULT_POLICY = {
  auto_deduct_break: false,
  break_minutes: 0,
  apply_break_after_minutes: 0,
  require_lunch_punch: false,
  allow_continuous_shift: true,
  max_daily_minutes: 720,
  min_daily_minutes: 0,
};

const DEDUCT_POLICY = {
  ...DEFAULT_POLICY,
  auto_deduct_break: true,
  break_minutes: 60,
  apply_break_after_minutes: 300,
};

// ─── tsToDate ─────────────────────────────────────────────────────────────────
describe('tsToDate', () => {
  test('MySQL string → Date (UTC)', () => {
    const d = tsToDate('2026-05-28 06:47:46');
    expect(d.toISOString()).toBe('2026-05-28T06:47:46.000Z');
  });

  test('ISO string', () => {
    const d = tsToDate('2026-05-28T06:47:46.000Z');
    expect(d.getUTCHours()).toBe(6);
  });

  test('Date passthrough', () => {
    const dt = new Date('2026-05-28T10:00:00Z');
    expect(tsToDate(dt)).toBe(dt);
  });
});

// ─── deduplicate ──────────────────────────────────────────────────────────────
describe('deduplicate', () => {
  const mk = (ts, id) => ({ id, timestamp: ts });

  test('mantiene marcaciones separadas por más de 60s', () => {
    const logs = [mk('2026-05-28 06:45:00', 1), mk('2026-05-28 12:00:00', 2)];
    const { deduped, suggestedExclusions } = deduplicate(logs);
    expect(deduped).toHaveLength(2);
    expect(suggestedExclusions).toHaveLength(0);
  });

  test('sugiere exclusión para duplicado dentro de 60s — NO elimina log', () => {
    const logs = [
      mk('2026-05-28 06:45:00', 1),
      mk('2026-05-28 06:45:30', 2), // 30s después — sugerido como exclusión
      mk('2026-05-28 12:00:00', 3),
    ];
    const { deduped, suggestedExclusions } = deduplicate(logs);
    // deduped excluye el cercano del cálculo provisional
    expect(deduped).toHaveLength(2);
    expect(deduped[0].id).toBe(1);
    expect(deduped[1].id).toBe(3);
    // log original sigue accesible en suggestedExclusions
    expect(suggestedExclusions).toHaveLength(1);
    expect(suggestedExclusions[0].id).toBe(2);
    expect(suggestedExclusions[0].exclusion_reason).toBe('duplicate_nearby');
    expect(suggestedExclusions[0].near_log_id).toBe(1);
    expect(suggestedExclusions[0].delta_ms).toBe(30000);
  });

  test('no excluye marcación a exactamente 60s', () => {
    const logs = [mk('2026-05-28 06:45:00', 1), mk('2026-05-28 06:46:00', 2)];
    const { deduped, suggestedExclusions } = deduplicate(logs);
    expect(deduped).toHaveLength(2);
    expect(suggestedExclusions).toHaveLength(0);
  });

  test('lista vacía', () => {
    const { deduped, suggestedExclusions } = deduplicate([]);
    expect(deduped).toHaveLength(0);
    expect(suggestedExclusions).toHaveLength(0);
  });
});

// ─── assignTypes ──────────────────────────────────────────────────────────────
describe('assignTypes', () => {
  const mk = (ts, type, id) => ({ id, timestamp: ts, type });

  test('todos unknown → alternancia por posición', () => {
    const logs = [
      mk('06:45:00', 'unknown', 1),
      mk('12:00:00', 'unknown', 2),
      mk('13:00:00', 'unknown', 3),
      mk('15:11:00', 'unknown', 4),
    ];
    const result = assignTypes(logs);
    expect(result.map(r => r.resolvedType)).toEqual(['in', 'out', 'in', 'out']);
    expect(result.every(r => r.confidence === 'inferred')).toBe(true);
  });

  test('tipos explícitos se conservan', () => {
    const logs = [
      mk('06:45:00', 'in',  1),
      mk('15:11:00', 'out', 2),
    ];
    const result = assignTypes(logs);
    expect(result[0].resolvedType).toBe('in');
    expect(result[0].confidence).toBe('explicit');
    expect(result[1].resolvedType).toBe('out');
    expect(result[1].confidence).toBe('explicit');
  });

  test('unknown entre explícitos sigue alternancia esperada', () => {
    const logs = [
      mk('06:45:00', 'in',      1),
      mk('12:00:00', 'unknown', 2), // esperado: out
      mk('13:00:00', 'unknown', 3), // esperado: in
      mk('15:11:00', 'out',     4),
    ];
    const result = assignTypes(logs);
    expect(result[1].resolvedType).toBe('out');
    expect(result[2].resolvedType).toBe('in');
  });
});

// ─── buildSegments ────────────────────────────────────────────────────────────
describe('buildSegments', () => {
  const mk = (ts, type, id, confidence = 'inferred') => ({
    id, timestamp: `2026-05-28 ${ts}`, resolvedType: type, confidence,
  });

  test('Caso A — 2 marcaciones: 1 segmento', () => {
    const logs = [mk('06:45:00', 'in', 1), mk('15:11:00', 'out', 2)];
    const { segments, anomalies } = buildSegments(logs);
    expect(segments).toHaveLength(1);
    expect(segments[0].gross_minutes).toBe(506); // 8h 26m
    expect(anomalies.filter(a => a.anomaly_type !== 'no_lunch_break')).toHaveLength(0);
  });

  test('Caso B — 4 marcaciones: 2 segmentos (mañana + tarde)', () => {
    const logs = [
      mk('06:45:00', 'in',  1),
      mk('12:00:00', 'out', 2),
      mk('13:00:00', 'in',  3),
      mk('15:11:00', 'out', 4),
    ];
    const { segments, anomalies } = buildSegments(logs);
    expect(segments).toHaveLength(2);
    expect(segments[0].gross_minutes).toBe(315); // 5h 15m
    expect(segments[1].gross_minutes).toBe(131); // 2h 11m
    expect(anomalies).toHaveLength(0);
  });

  test('entrada sin salida → anomalía missing_out', () => {
    const logs = [mk('06:45:00', 'in', 1)];
    const { segments, anomalies } = buildSegments(logs);
    expect(segments[0].anomaly_code).toBe('missing_out');
    expect(anomalies.some(a => a.anomaly_type === 'missing_out')).toBe(true);
  });

  test('lista vacía → sin segmentos ni anomalías', () => {
    const { segments, anomalies } = buildSegments([]);
    expect(segments).toHaveLength(0);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── computeBaseMetrics ───────────────────────────────────────────────────────
describe('computeBaseMetrics', () => {
  test('2 marcaciones — calcula grossMinutes y sin lunchOut', () => {
    const segs = [{
      segment_type: 'work',
      in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 15:11:00', gross_minutes: 506,
    }];
    const m = computeBaseMetrics(segs);
    expect(m.grossMinutes).toBe(506);
    expect(m.sumSegMins).toBe(506);
    expect(m.lunchOut).toBeNull();
    expect(m.lunchIn).toBeNull();
    expect(m.lunchMinutes).toBe(0);
  });

  test('4 marcaciones — detecta lunchOut/lunchIn y sumSegMins correcto', () => {
    const segs = [
      { segment_type: 'work', in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 12:00:00', gross_minutes: 315 },
      { segment_type: 'work', in_at: '2026-05-28 13:00:00', out_at: '2026-05-28 15:11:00', gross_minutes: 131 },
    ];
    const m = computeBaseMetrics(segs);
    expect(m.sumSegMins).toBe(446);           // 315 + 131
    expect(m.lunchMinutes).toBe(60);          // 13:00 - 12:00
    expect(m.lunchOut).toBe('2026-05-28 12:00:00');
    expect(m.lunchIn).toBe('2026-05-28 13:00:00');
    expect(m.grossMinutes).toBe(506);         // 06:45 → 15:11 span
  });
});

// ─── applyPolicy ─────────────────────────────────────────────────────────────
describe('applyPolicy', () => {
  // Caso A/D: 2 marcaciones sin política de descuento → worked = gross
  test('Caso A/D: 2 marcaciones + auto_deduct=false → worked = gross', () => {
    const segs = [{
      segment_type: 'work',
      in_at: '2026-05-28 06:47:46', out_at: '2026-05-28 15:11:10', gross_minutes: 503,
    }];
    const base = computeBaseMetrics(segs);
    const result = applyPolicy(base, segs, DEFAULT_POLICY);
    expect(result.workedMinutes).toBe(503);
    expect(result.breakMinutes).toBe(0);
    expect(result.breakSource).toBe('none');
  });

  // Caso B: 4 marcaciones → worked = Σ segmentos (política no afecta almuerzo marcado)
  test('Caso B: 4 marcaciones → worked = suma segmentos, política ignorada para lunch', () => {
    const segs = [
      { segment_type: 'work', in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 12:00:00', gross_minutes: 315 },
      { segment_type: 'work', in_at: '2026-05-28 13:00:00', out_at: '2026-05-28 15:11:00', gross_minutes: 131 },
    ];
    const base = computeBaseMetrics(segs);
    // Incluso con política de descuento automático, el almuerzo explícito prevalece
    const result = applyPolicy(base, segs, DEDUCT_POLICY);
    expect(result.workedMinutes).toBe(446);
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('marked_lunch');
  });

  // Caso C: 2 marcaciones + auto_deduct=true + gross >= umbral → descuento automático
  test('Caso C: 2 marcaciones + auto_deduct=true + gross >= umbral → worked = gross - break_minutes', () => {
    const segs = [{
      segment_type: 'work',
      in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 15:11:00', gross_minutes: 506,
    }];
    const base = computeBaseMetrics(segs);
    const result = applyPolicy(base, segs, DEDUCT_POLICY); // umbral 300min, break 60min
    expect(result.workedMinutes).toBe(446); // 506 - 60
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('auto_deduct');
  });

  // Caso C borde: gross < umbral → no se descuenta aunque política lo pida
  test('Caso C borde: gross < umbral → sin descuento automático', () => {
    const segs = [{
      segment_type: 'work',
      in_at: '2026-05-28 08:00:00', out_at: '2026-05-28 12:30:00', gross_minutes: 270,
    }];
    const base = computeBaseMetrics(segs);
    const result = applyPolicy(base, segs, DEDUCT_POLICY); // umbral=300, gross=270 → no descuenta
    expect(result.workedMinutes).toBe(270);
    expect(result.breakMinutes).toBe(0);
    expect(result.breakSource).toBe('none');
  });

  // Caso D: 2 marcaciones con política default → NO se descuenta nada
  test('Caso D: política default (sin descuento) → worked = gross siempre', () => {
    const segs = [{
      segment_type: 'work',
      in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 15:11:00', gross_minutes: 506,
    }];
    const base = computeBaseMetrics(segs);
    const result = applyPolicy(base, segs, DEFAULT_POLICY);
    expect(result.workedMinutes).toBe(506);
    expect(result.breakMinutes).toBe(0);
    expect(result.breakSource).toBe('none');
  });

  // 4 marcaciones con política default: almuerzo marcado siempre prevalece
  test('Caso B + política default: almuerzo marcado prevalece sobre default', () => {
    const segs = [
      { segment_type: 'work', in_at: '2026-05-28 06:45:11', out_at: '2026-05-28 12:00:00', gross_minutes: 314 },
      { segment_type: 'work', in_at: '2026-05-28 13:00:00', out_at: '2026-05-28 15:11:05', gross_minutes: 131 },
    ];
    const base = computeBaseMetrics(segs);
    const result = applyPolicy(base, segs, DEFAULT_POLICY);
    expect(result.workedMinutes).toBe(445);        // 314 + 131
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('marked_lunch');
  });
});

// ─── detectDayAnomalies ───────────────────────────────────────────────────────
describe('detectDayAnomalies', () => {
  test('grossMinutes > 600 detecta long_shift', () => {
    // grossMinutes > LONG_SHIFT_MINUTES (600) dispara la anomalía
    const metrics  = { workedMinutes: 620, grossMinutes: 620, lunchOut: null };
    const segments = [
      { segment_type: 'work', in_at: '2026-05-28 06:00:00', out_at: '2026-05-28 16:20:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments, DEFAULT_POLICY);
    expect(anomalies.some(a => a.anomaly_type === 'long_shift')).toBe(true);
  });

  test('grossMinutes <= 600 sin almuerzo NO detecta long_shift', () => {
    const metrics  = { workedMinutes: 506, grossMinutes: 506, lunchOut: null };
    const segments = [
      { segment_type: 'work', in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 15:11:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments, DEFAULT_POLICY);
    expect(anomalies.some(a => a.anomaly_type === 'long_shift')).toBe(false);
  });

  test('require_lunch_punch=true + sin almuerzo → detecta no_lunch_break', () => {
    const policyWithLunch = { ...DEFAULT_POLICY, require_lunch_punch: true };
    const metrics  = { workedMinutes: 506, grossMinutes: 506, lunchOut: null };
    const segments = [
      { segment_type: 'work', in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 15:11:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments, policyWithLunch);
    expect(anomalies.some(a => a.anomaly_type === 'no_lunch_break')).toBe(true);
  });

  test('require_lunch_punch=false (default) → NO detecta no_lunch_break', () => {
    const metrics  = { workedMinutes: 360, grossMinutes: 360, lunchOut: null };
    const segments = [
      { segment_type: 'work', in_at: '2026-05-28 07:00:00', out_at: '2026-05-28 13:00:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments, DEFAULT_POLICY);
    expect(anomalies.some(a => a.anomaly_type === 'no_lunch_break')).toBe(false);
  });

  test('jornada normal con almuerzo marcado → sin anomalías', () => {
    const metrics  = { workedMinutes: 446, grossMinutes: 506, lunchOut: '2026-05-28 12:00:00' };
    const segments = [
      { segment_type: 'work', in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 12:00:00' },
      { segment_type: 'work', in_at: '2026-05-28 13:00:00', out_at: '2026-05-28 15:11:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments, DEFAULT_POLICY);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Integración: pipeline completo (Juan Carlos & Janina) ────────────────────
describe('pipeline buildSegments + computeBaseMetrics + applyPolicy (Juan Carlos)', () => {
  test('2 marcaciones reales de staging + política default → worked_minutes = gross', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:47:46', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 15:11:10', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    expect(typed[0].resolvedType).toBe('in');
    expect(typed[1].resolvedType).toBe('out');

    const { segments } = buildSegments(typed);
    expect(segments[0].gross_minutes).toBe(503); // 15:11:10 - 06:47:46 = 8h 23m 24s ≈ 503m

    const base = computeBaseMetrics(segments);
    expect(base.firstIn).toBe('2026-05-28 06:47:46');
    expect(base.lastOut).toBe('2026-05-28 15:11:10');
    expect(base.grossMinutes).toBe(503);

    const result = applyPolicy(base, segments, DEFAULT_POLICY);
    expect(result.workedMinutes).toBe(503);
    expect(result.breakMinutes).toBe(0);
    expect(result.breakSource).toBe('none');
  });

  test('2 marcaciones + política auto_deduct → worked = gross - 60', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:47:46', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 15:11:10', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEDUCT_POLICY);
    expect(result.workedMinutes).toBe(503 - 60); // 443
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('auto_deduct');
  });

  test('4 marcaciones — worked_minutes excluye almuerzo (Janina)', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:45:11', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 12:00:00', type: 'unknown' },
      { id: 3, timestamp: '2026-05-28 13:00:00', type: 'unknown' },
      { id: 4, timestamp: '2026-05-28 15:11:05', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    expect(segments).toHaveLength(2);

    const base = computeBaseMetrics(segments);
    const grossSpan = Math.round(
      (tsToDate('2026-05-28 15:11:05') - tsToDate('2026-05-28 06:45:11')) / 60000
    );

    const result = applyPolicy(base, segments, DEFAULT_POLICY);
    expect(result.workedMinutes).toBeLessThan(grossSpan); // NO incluye almuerzo
    expect(result.breakMinutes).toBe(60);
    expect(result.lunchOut).toBe('2026-05-28 12:00:00');
    expect(result.lunchIn).toBe('2026-05-28 13:00:00');
    expect(result.breakSource).toBe('marked_lunch');
  });

  test('4 marcaciones + política auto_deduct: almuerzo marcado sigue prevaleciendo', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:45:11', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 12:00:00', type: 'unknown' },
      { id: 3, timestamp: '2026-05-28 13:00:00', type: 'unknown' },
      { id: 4, timestamp: '2026-05-28 15:11:05', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEDUCT_POLICY);
    // Con almuerzo marcado explícitamente, la política auto_deduct es irrelevante
    expect(result.breakSource).toBe('marked_lunch');
    expect(result.breakMinutes).toBe(60);
  });
});

// ─── Reglas de negocio — process-day-v2 ──────────────────────────────────────
describe('process-day-v2 business rules', () => {
  // REGLA 1: jornada corrida con default policy → sin descuento
  test('06:00-13:00 + default policy → gross=420, break=0, worked=420', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:00:00', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 13:00:00', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEFAULT_POLICY);

    expect(result.grossMinutes).toBe(420);
    expect(result.breakMinutes).toBe(0);
    expect(result.workedMinutes).toBe(420);
    expect(result.breakSource).toBe('none');
  });

  // REGLA 2: 4 marcaciones IN/OUT/IN/OUT → segmentos reales, break = gap real
  test('4 marcaciones IN/OUT/IN/OUT → segmentos y break real calculados', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:00:00', type: 'in' },
      { id: 2, timestamp: '2026-05-28 12:00:00', type: 'out' },
      { id: 3, timestamp: '2026-05-28 13:00:00', type: 'in' },
      { id: 4, timestamp: '2026-05-28 15:00:00', type: 'out' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEFAULT_POLICY);

    expect(segments).toHaveLength(2);
    expect(result.grossMinutes).toBe(540);         // 06:00→15:00 span
    expect(result.breakMinutes).toBe(60);          // 12:00→13:00 lunch gap
    expect(result.workedMinutes).toBe(360 + 120);  // 6h mañana + 2h tarde = 480
    expect(result.breakSource).toBe('marked_lunch');
  });

  // REGLA 3: 2 marcaciones + auto_deduct=true + gross >= umbral → descuento
  test('2 marcaciones + auto_deduct=true + gross >= umbral → worked = gross - break_minutes', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:45:00', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 15:11:00', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEDUCT_POLICY); // umbral=300, break=60

    expect(result.workedMinutes).toBe(result.grossMinutes - 60);
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('auto_deduct');
  });

  // REGLA 3 borde: gross < umbral → sin descuento aunque auto_deduct=true
  test('2 marcaciones + auto_deduct=true + gross < umbral → sin descuento', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 08:00:00', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 12:30:00', type: 'unknown' }, // 270 min < 300 umbral
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEDUCT_POLICY);

    expect(result.grossMinutes).toBe(270);
    expect(result.workedMinutes).toBe(270);
    expect(result.breakMinutes).toBe(0);
    expect(result.breakSource).toBe('none');
  });

  // REGLA 4: sin política configurada → DEFAULT aplicado (auto_deduct=false)
  test('sin política → DEFAULT: auto_deduct=false, break=0, allow_continuous_shift=true', () => {
    // DEFAULT_POLICY es exactamente la política que debe aplicarse cuando no hay nada configurado
    expect(DEFAULT_POLICY.auto_deduct_break).toBe(false);
    expect(DEFAULT_POLICY.break_minutes).toBe(0);
    expect(DEFAULT_POLICY.allow_continuous_shift).toBe(true);

    // Aplicando DEFAULT a 2 marcaciones nunca descuenta
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:00:00', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 15:00:00', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEFAULT_POLICY);

    expect(result.breakMinutes).toBe(0);
    expect(result.workedMinutes).toBe(result.grossMinutes);
    expect(result.breakSource).toBe('none');
  });
});

// ─── Preservación de timestamps — sin drift de TZ ────────────────────────────
describe('timestamps preserved through pipeline (no TZ drift)', () => {
  test('formatMysqlDateTimeLocal preserva string MySQL exacto', () => {
    expect(formatMysqlDateTimeLocal('2026-05-28 06:47:46')).toBe('2026-05-28 06:47:46');
    expect(formatMysqlDateTimeLocal('2026-05-28 15:11:10')).toBe('2026-05-28 15:11:10');
  });

  test('formatMysqlDateTimeLocal convierte ISO con T a formato MySQL', () => {
    expect(formatMysqlDateTimeLocal('2026-05-28T06:47:46')).toBe('2026-05-28 06:47:46');
  });

  test('formatMysqlDateTimeLocal devuelve null si value es null/undefined', () => {
    expect(formatMysqlDateTimeLocal(null)).toBeNull();
    expect(formatMysqlDateTimeLocal(undefined)).toBeNull();
  });

  test('input 06:47:46 in, 15:11:10 out → segmentos preservan timestamps exactos', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:47:46', type: 'in' },
      { id: 2, timestamp: '2026-05-28 15:11:10', type: 'out' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);

    expect(segments).toHaveLength(1);
    expect(segments[0].in_at).toBe('2026-05-28 06:47:46');
    expect(segments[0].out_at).toBe('2026-05-28 15:11:10');
    expect(segments[0].segment_index).toBe(1);
  });

  test('input 06:47:46 in, 15:11:10 out → métricas base correctas (gross=503, sin break)', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:47:46', type: 'in' },
      { id: 2, timestamp: '2026-05-28 15:11:10', type: 'out' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);

    expect(base.firstIn).toBe('2026-05-28 06:47:46');
    expect(base.lastOut).toBe('2026-05-28 15:11:10');
    // 15:11:10 − 06:47:46 = 8h 23m 24s → 503.4 min → round → 503
    expect(base.grossMinutes).toBe(503);
    expect(base.lunchOut).toBeNull();
    expect(base.lunchIn).toBeNull();
  });

  test('input 06:47:46 in, 15:11:10 out + política por defecto → worked=503, break=0', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:47:46', type: 'in' },
      { id: 2, timestamp: '2026-05-28 15:11:10', type: 'out' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEFAULT_POLICY);

    expect(result.grossMinutes).toBe(503);
    expect(result.workedMinutes).toBe(503);
    expect(result.breakMinutes).toBe(0);
    expect(result.breakSource).toBe('none');
    expect(result.firstIn).toBe('2026-05-28 06:47:46');
    expect(result.lastOut).toBe('2026-05-28 15:11:10');
  });
});

// ─── Empleado con 4 marcaciones (almuerzo marcado) ────────────────────────────
describe('4-punch employee — IN/OUT/IN/OUT con almuerzo marcado', () => {
  const logs4 = [
    { id: 1, timestamp: '2026-05-28 06:45:00', type: 'in'  },
    { id: 2, timestamp: '2026-05-28 12:00:00', type: 'out' },
    { id: 3, timestamp: '2026-05-28 13:00:00', type: 'in'  },
    { id: 4, timestamp: '2026-05-28 15:11:10', type: 'out' },
  ];

  test('buildSegments genera 2 segmentos con indices 1 y 2', () => {
    const { segments } = buildSegments(assignTypes(logs4));
    expect(segments).toHaveLength(2);
    expect(segments[0].segment_index).toBe(1);
    expect(segments[1].segment_index).toBe(2);
  });

  test('segmentos preservan timestamps exactos', () => {
    const { segments } = buildSegments(assignTypes(logs4));
    expect(segments[0].in_at).toBe('2026-05-28 06:45:00');
    expect(segments[0].out_at).toBe('2026-05-28 12:00:00');
    expect(segments[1].in_at).toBe('2026-05-28 13:00:00');
    expect(segments[1].out_at).toBe('2026-05-28 15:11:10');
  });

  test('computeBaseMetrics detecta lunchOut/lunchIn y calcula lunchMinutes=60', () => {
    const { segments } = buildSegments(assignTypes(logs4));
    const base = computeBaseMetrics(segments);
    expect(base.lunchOut).toBe('2026-05-28 12:00:00');
    expect(base.lunchIn).toBe('2026-05-28 13:00:00');
    expect(base.lunchMinutes).toBe(60);
    // gross = 06:45→15:11 = 506 min
    expect(base.grossMinutes).toBe(506);
    // sumSegMins = (12:00-06:45)=375 + (15:11-13:00)=131 = 506... wait
    // mañana: 06:45→12:00 = 5h15m = 315 min
    // tarde:  13:00→15:11 = 2h11m = 131 min
    expect(base.sumSegMins).toBe(315 + 131); // 446
  });

  test('applyPolicy con DEFAULT (auto_deduct=false) → worked=446, break=60', () => {
    const { segments } = buildSegments(assignTypes(logs4));
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEFAULT_POLICY);
    // Almuerzo marcado explícitamente → worked = sumSegMins, break = lunchMinutes
    expect(result.workedMinutes).toBe(446);
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('marked_lunch');
  });

  test('applyPolicy con DEDUCT_POLICY → almuerzo marcado prevalece sobre auto_deduct', () => {
    const { segments } = buildSegments(assignTypes(logs4));
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, DEDUCT_POLICY);
    // Almuerzo marcado siempre prevalece
    expect(result.workedMinutes).toBe(446);
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('marked_lunch');
  });
});

// ─── Política employee con auto_deduct_break=true ─────────────────────────────
describe('política auto_deduct_break=true — gross=503, break=60, worked=443', () => {
  const EMPLOYEE_POLICY = {
    ...DEFAULT_POLICY,
    auto_deduct_break: true,
    break_minutes: 60,
    apply_break_after_minutes: 300, // umbral: jornada > 5h activa el descuento
  };

  test('2 marcaciones + política employee auto_deduct → worked=443, break=60', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:47:46', type: 'in' },
      { id: 2, timestamp: '2026-05-28 15:11:10', type: 'out' },
    ];
    const { segments } = buildSegments(assignTypes(rawLogs));
    const base = computeBaseMetrics(segments);
    // gross=503, umbral=300 → aplica descuento de 60
    const result = applyPolicy(base, segments, EMPLOYEE_POLICY);

    expect(result.grossMinutes).toBe(503);
    expect(result.breakMinutes).toBe(60);
    expect(result.workedMinutes).toBe(503 - 60); // 443
    expect(result.breakSource).toBe('auto_deduct');
  });

  test('Janina: 2 marcaciones, gross=506, auto_deduct=true → worked=446, break=60', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:45:11', type: 'in' },
      { id: 2, timestamp: '2026-05-28 15:11:05', type: 'out' },
    ];
    const { segments } = buildSegments(assignTypes(rawLogs));
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, EMPLOYEE_POLICY);

    expect(result.grossMinutes).toBe(506);
    expect(result.workedMinutes).toBe(506 - 60); // 446
    expect(result.breakMinutes).toBe(60);
    expect(result.breakSource).toBe('auto_deduct');
  });

  test('jornada corta < umbral + auto_deduct=true → sin descuento', () => {
    // gross = 270 min < umbral 300 → no aplica descuento
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 08:00:00', type: 'in' },
      { id: 2, timestamp: '2026-05-28 12:30:00', type: 'out' },
    ];
    const { segments } = buildSegments(assignTypes(rawLogs));
    const base = computeBaseMetrics(segments);
    const result = applyPolicy(base, segments, EMPLOYEE_POLICY);

    expect(result.grossMinutes).toBe(270);
    expect(result.workedMinutes).toBe(270);
    expect(result.breakMinutes).toBe(0);
    expect(result.breakSource).toBe('none');
  });
});

// ─── Pipeline completo — validación de timestamps en cada etapa ───────────────
describe('pipeline completo — validación E2E de timestamps en cada etapa', () => {
  test('2 marcaciones sin descuento — timestamps fluyen sin mutación en todos los pasos', () => {
    const IN_TS  = '2026-05-28 06:47:46';
    const OUT_TS = '2026-05-28 15:11:10';
    const rawLogs = [
      { id: 1, timestamp: IN_TS,  type: 'in'  },
      { id: 2, timestamp: OUT_TS, type: 'out' },
    ];

    // Etapa 1: deduplication no modifica timestamps
    const { deduped } = deduplicate(rawLogs);
    expect(deduped[0].timestamp).toBe(IN_TS);
    expect(deduped[1].timestamp).toBe(OUT_TS);

    // Etapa 2: assignTypes preserva timestamps
    const typed = assignTypes(deduped);
    expect(typed[0].timestamp).toBe(IN_TS);

    // Etapa 3: buildSegments normaliza a string MySQL sin drift
    const { segments } = buildSegments(typed);
    expect(segments[0].in_at).toBe(IN_TS);
    expect(segments[0].out_at).toBe(OUT_TS);
    expect(segments[0].segment_index).toBe(1);
    expect(segments[0].gross_minutes).toBe(503);

    // Etapa 4: computeBaseMetrics preserva los strings en firstIn/lastOut
    const base = computeBaseMetrics(segments);
    expect(base.firstIn).toBe(IN_TS);
    expect(base.lastOut).toBe(OUT_TS);
    expect(base.grossMinutes).toBe(503);

    // Etapa 5: applyPolicy devuelve los mismos strings en firstIn/lastOut
    const final = applyPolicy(base, segments, DEFAULT_POLICY);
    expect(final.firstIn).toBe(IN_TS);
    expect(final.lastOut).toBe(OUT_TS);
    expect(final.workedMinutes).toBe(503);
    expect(final.breakMinutes).toBe(0);
  });

  test('2 marcaciones con descuento automático — timestamps preservados, worked=gross-60', () => {
    const IN_TS  = '2026-05-28 06:47:46';
    const OUT_TS = '2026-05-28 15:11:10';
    const rawLogs = [
      { id: 1, timestamp: IN_TS,  type: 'in'  },
      { id: 2, timestamp: OUT_TS, type: 'out' },
    ];
    const POLICY = { ...DEFAULT_POLICY, auto_deduct_break: true, break_minutes: 60, apply_break_after_minutes: 300 };
    const { segments } = buildSegments(assignTypes(rawLogs));
    const base = computeBaseMetrics(segments);
    const final = applyPolicy(base, segments, POLICY);

    expect(segments[0].in_at).toBe(IN_TS);
    expect(segments[0].out_at).toBe(OUT_TS);
    expect(final.firstIn).toBe(IN_TS);
    expect(final.lastOut).toBe(OUT_TS);
    expect(final.workedMinutes).toBe(443);
    expect(final.breakMinutes).toBe(60);
    expect(final.breakSource).toBe('auto_deduct');
  });

  test('4 marcaciones almuerzo marcado — timestamps preservados, worked=sumSegMins, break=lunchMinutes', () => {
    const logs4 = [
      { id: 1, timestamp: '2026-05-28 06:45:00', type: 'in'  },
      { id: 2, timestamp: '2026-05-28 12:00:00', type: 'out' },
      { id: 3, timestamp: '2026-05-28 13:00:00', type: 'in'  },
      { id: 4, timestamp: '2026-05-28 15:11:10', type: 'out' },
    ];
    const { segments } = buildSegments(assignTypes(logs4));
    const base = computeBaseMetrics(segments);
    const final = applyPolicy(base, segments, DEFAULT_POLICY);

    // Todos los timestamps preservados
    expect(segments[0].in_at).toBe('2026-05-28 06:45:00');
    expect(segments[0].out_at).toBe('2026-05-28 12:00:00');
    expect(segments[1].in_at).toBe('2026-05-28 13:00:00');
    expect(segments[1].out_at).toBe('2026-05-28 15:11:10');

    expect(final.lunchOut).toBe('2026-05-28 12:00:00');
    expect(final.lunchIn).toBe('2026-05-28 13:00:00');
    expect(final.breakMinutes).toBe(60);
    expect(final.workedMinutes).toBe(446); // 315 + 131
    expect(final.breakSource).toBe('marked_lunch');
  });
});

// ─── Inmutabilidad de attendance_logs ─────────────────────────────────────────
describe('inmutabilidad — attendance_logs no se elimina ni oculta', () => {
  const mk = (id, ts, type) => ({ id, timestamp: ts, type });

  // Caso Cecilia Díaz: 05:35:03 in / 05:35:06 in / 09:13:26 out / 09:43:05 in
  describe('caso Cecilia Díaz — duplicado cercano + entrada sin salida', () => {
    const logs = [
      mk(1, '2026-05-28 05:35:03', 'in'),
      mk(2, '2026-05-28 05:35:06', 'in'),  // 3s después — duplicate_nearby
      mk(3, '2026-05-28 09:13:26', 'out'),
      mk(4, '2026-05-28 09:43:05', 'in'),  // entrada sin salida
    ];

    test('raw_logs contiene las 4 marcaciones — ninguna eliminada', () => {
      const { deduped, suggestedExclusions } = deduplicate(logs);
      // En total, deduped + suggestedExclusions = logs originales
      expect(deduped.length + suggestedExclusions.length).toBe(logs.length);
    });

    test('suggestedExclusions contiene el log id=2 (05:35:06) con razón duplicate_nearby', () => {
      const { suggestedExclusions } = deduplicate(logs);
      expect(suggestedExclusions).toHaveLength(1);
      expect(suggestedExclusions[0].id).toBe(2);
      expect(suggestedExclusions[0].exclusion_reason).toBe('duplicate_nearby');
      expect(suggestedExclusions[0].near_log_id).toBe(1);
      expect(suggestedExclusions[0].delta_ms).toBe(3000);
    });

    test('deduped aún contiene log id=4 (09:43:05 in) — entrada sin salida visible', () => {
      const { deduped } = deduplicate(logs);
      expect(deduped.find(l => l.id === 4)).toBeTruthy();
    });

    test('buildSegments genera anomalía missing_out para id=4', () => {
      const { deduped } = deduplicate(logs);
      const typed = assignTypes(deduped);
      const { segments, anomalies } = buildSegments(typed);
      expect(anomalies.some(a => a.anomaly_type === 'missing_out')).toBe(true);
      expect(segments.some(s => s.segment_type === 'incomplete')).toBe(true);
    });

    test('el segmento incompleto apunta al log id=4', () => {
      const { deduped } = deduplicate(logs);
      const typed = assignTypes(deduped);
      const { segments } = buildSegments(typed);
      const incomplete = segments.find(s => s.segment_type === 'incomplete');
      expect(incomplete).toBeDefined();
      expect(incomplete.in_log_id).toBe(4);
      expect(incomplete.out_log_id).toBeNull();
    });
  });

  describe('duplicado cercano — anomalía generada con contexto de log_id', () => {
    test('se genera anomalía duplicate_nearby con log_id en raw_payload', () => {
      const logs = [
        mk(10, '2026-05-28 06:00:00', 'in'),
        mk(11, '2026-05-28 06:00:05', 'in'), // 5s — duplicado
        mk(12, '2026-05-28 14:00:00', 'out'),
      ];
      const { suggestedExclusions } = deduplicate(logs);
      expect(suggestedExclusions[0].id).toBe(11);
      expect(suggestedExclusions[0].exclusion_reason).toBe('duplicate_nearby');
      // near_log_id permite a la UI vincular la sugerencia con el log original
      expect(suggestedExclusions[0].near_log_id).toBe(10);
    });
  });

  describe('entrada sin salida — segmento incomplete', () => {
    test('genera segmento incomplete sin out_at', () => {
      const logs = [mk(20, '2026-05-28 08:00:00', 'in')];
      const { segments, anomalies } = buildSegments(assignTypes(logs));
      expect(segments[0].segment_type).toBe('incomplete');
      expect(segments[0].out_at).toBeNull();
      expect(anomalies[0].anomaly_type).toBe('missing_out');
    });

    test('el segmento incomplete no inventa una salida automática', () => {
      const logs = [mk(21, '2026-05-28 08:00:00', 'in')];
      const { segments } = buildSegments(assignTypes(logs));
      expect(segments[0].out_at).toBeNull();
      expect(segments[0].gross_minutes).toBeNull();
    });
  });

  describe('verificación de conteo — procesamiento no elimina logs', () => {
    test('cantidad total de logs en raw_logs igual a entrada tras deduplicación', () => {
      const originalLogs = [
        mk(30, '2026-05-28 06:00:00', 'in'),
        mk(31, '2026-05-28 06:00:03', 'in'),  // duplicado
        mk(32, '2026-05-28 12:00:00', 'out'),
        mk(33, '2026-05-28 13:00:00', 'in'),
        mk(34, '2026-05-28 17:00:00', 'out'),
      ];
      const { deduped, suggestedExclusions } = deduplicate(originalLogs);
      // La suma debe ser igual a los originales — ninguno fue eliminado
      expect(deduped.length + suggestedExclusions.length).toBe(originalLogs.length);
    });

    test('suggestedExclusions sigue teniendo todos los campos del log original', () => {
      const logs = [
        mk(40, '2026-05-28 06:00:00', 'in'),
        mk(41, '2026-05-28 06:00:02', 'in'),
      ];
      const { suggestedExclusions } = deduplicate(logs);
      const excl = suggestedExclusions[0];
      // El log original está completo — id, timestamp, type preservados
      expect(excl.id).toBe(41);
      expect(excl.timestamp).toBe('2026-05-28 06:00:02');
      expect(excl.type).toBe('in');
      // Campos adicionales de contexto para UI/RRHH
      expect(excl.exclusion_reason).toBe('duplicate_nearby');
      expect(excl.delta_ms).toBe(2000);
    });
  });
});

// ─── processAttendanceDay integration ────────────────────────────────────────
describe('processAttendanceDay — approved adjustments scope', () => {
  const { sequelize } = require('../src/config/database');
  const { processAttendanceDay, _resetColCache } = require('../src/services/attendanceProcessor');

  beforeEach(() => {
    sequelize.query.mockReset();
    _resetColCache();
  });

  function mockQueriesForCecilia({ adjRows = [] } = {}) {
    sequelize.query.mockImplementation((sql) => {
      const s = String(sql).trim();
      if (s.startsWith('SELECT id, timestamp')) {
        return Promise.resolve([[
          { id: 1, timestamp: '2026-05-28 05:35:03', type: 'in', source: 'device', device_id: 1 },
          { id: 2, timestamp: '2026-05-28 05:35:06', type: 'in', source: 'device', device_id: 1 },
          { id: 3, timestamp: '2026-05-28 09:13:26', type: 'out', source: 'device', device_id: 1 },
          { id: 4, timestamp: '2026-05-28 09:43:05', type: 'in', source: 'device', device_id: 1 },
          { id: 5, timestamp: '2026-05-28 17:00:00', type: 'out', source: 'manual_adjustment', device_id: null },
        ]]);
      }
      if (s.includes('attendance_adjustments')) {
        return Promise.resolve([adjRows]);
      }
      if (s.includes('information_schema.COLUMNS')) {
        return Promise.resolve([[{ c: 1 }]]);
      }
      if (s.includes('information_schema.TABLES')) {
        return Promise.resolve([[{ ok: 1 }]]);
      }
      if (s.includes('attendance_work_policies')) {
        return Promise.resolve([[]]);
      }
      if (s.includes('employees')) {
        return Promise.resolve([[{ department_id: 1, branch_id: null }]]);
      }
      if (s.includes('schedules')) {
        return Promise.resolve([[null]]);
      }
      return Promise.resolve([{ affectedRows: 1 }]);
    });
  }

  test('no ReferenceError when attendance_adjustments table missing', async () => {
    sequelize.query.mockImplementation((sql) => {
      const s = String(sql).trim();
      if (s.startsWith('SELECT id, timestamp')) {
        return Promise.resolve([[
          { id: 1, timestamp: '2026-05-28 09:00:00', type: 'in', source: 'device', device_id: 1 },
          { id: 2, timestamp: '2026-05-28 17:00:00', type: 'out', source: 'device', device_id: 1 },
        ]]);
      }
      if (s.includes('attendance_adjustments')) {
        const err = new Error('Table does not exist');
        err.original = { errno: 1146 };
        return Promise.reject(err);
      }
      if (s.includes('information_schema')) {
        return Promise.resolve([[{ c: 1 }]]);
      }
      if (s.includes('attendance_work_policies')) {
        return Promise.resolve([[]]);
      }
      if (s.includes('employees')) {
        return Promise.resolve([[{ department_id: 1, branch_id: null }]]);
      }
      if (s.includes('schedules')) {
        return Promise.resolve([[null]]);
      }
      return Promise.resolve([{ affectedRows: 1 }]);
    });

    const result = await processAttendanceDay({ date: '2026-05-28', employeeId: 927 });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].segment_type).toBe('work');
  });

  test('Cecilia: manual_adjustment out closes missing_out', async () => {
    mockQueriesForCecilia({
      adjRows: [{ adjustment_type: 'add_punch', original_log_id: null, new_value: '{"timestamp":"2026-05-28 17:00:00","type":"out"}' }],
    });

    const result = await processAttendanceDay({ date: '2026-05-28', employeeId: 927 });

    const workSegs = result.segments.filter(s => s.segment_type === 'work');
    expect(workSegs.length).toBe(2);
    expect(workSegs[0].in_at).toBe('2026-05-28 05:35:03');
    expect(workSegs[0].out_at).toBe('2026-05-28 09:13:26');
    expect(workSegs[1].in_at).toBe('2026-05-28 09:43:05');
    expect(workSegs[1].out_at).toBe('2026-05-28 17:00:00');

    const missingOut = result.anomalies.filter(a => a.anomaly_type === 'missing_out');
    expect(missingOut).toHaveLength(0);

    expect(result.finalMetrics.lastOut).toBe('2026-05-28 17:00:00');
    expect(result.finalMetrics.calculation_status).toBe('adjusted');
    // requires_review=true due to duplicate_nearby (05:35:03 vs 05:35:06, 3s gap)
    const dupAnomaly = result.anomalies.filter(a => a.anomaly_type === 'duplicate_nearby');
    expect(dupAnomaly.length).toBeGreaterThanOrEqual(1);
  });

  test('approvedTypeOverrides and approvedTimeOverrides accessible after try/catch', async () => {
    mockQueriesForCecilia({
      adjRows: [
        { adjustment_type: 'change_type', original_log_id: 2, new_value: '{"type":"out"}' },
      ],
    });

    const result = await processAttendanceDay({ date: '2026-05-28', employeeId: 927 });
    expect(result.segments).toBeDefined();
    expect(result.anomalies).toBeDefined();
  });
});
