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
    const logs = [
      mk('2026-05-28 06:45:00', 1),
      mk('2026-05-28 12:00:00', 2),
    ];
    expect(deduplicate(logs)).toHaveLength(2);
  });

  test('elimina duplicado dentro de 60s', () => {
    const logs = [
      mk('2026-05-28 06:45:00', 1),
      mk('2026-05-28 06:45:30', 2), // 30s después — duplicado
      mk('2026-05-28 12:00:00', 3),
    ];
    const result = deduplicate(logs);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(3);
  });

  test('no elimina marcación a exactamente 60s', () => {
    const logs = [
      mk('2026-05-28 06:45:00', 1),
      mk('2026-05-28 06:46:00', 2), // exactamente 60s — NO duplicado
    ];
    expect(deduplicate(logs)).toHaveLength(2);
  });

  test('lista vacía', () => {
    expect(deduplicate([])).toHaveLength(0);
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
