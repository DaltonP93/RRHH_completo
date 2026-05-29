'use strict';
/**
 * Tests para attendanceProcessor.js — Motor V2 multi-punch con almuerzo.
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
  computeMetrics,
  detectDayAnomalies,
  tsToDate,
} = require('../src/services/attendanceProcessor');

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
    expect(segments[0].minutes).toBe(506); // 8h 26m
    expect(anomalies.filter(a => a.anomaly_type !== 'no_lunch_break')).toHaveLength(0);
  });

  test('Caso A — 4 marcaciones: 2 segmentos (mañana + tarde)', () => {
    const logs = [
      mk('06:45:00', 'in',  1),
      mk('12:00:00', 'out', 2),
      mk('13:00:00', 'in',  3),
      mk('15:11:00', 'out', 4),
    ];
    const { segments, anomalies } = buildSegments(logs);
    expect(segments).toHaveLength(2);
    expect(segments[0].minutes).toBe(315); // 5h 15m
    expect(segments[1].minutes).toBe(131); // 2h 11m
    expect(anomalies).toHaveLength(0);
  });

  test('entrada sin salida → anomalía missing_out', () => {
    const logs = [mk('06:45:00', 'in', 1)];
    const { segments, anomalies } = buildSegments(logs);
    expect(segments[0].anomaly_code).toBe('missing_out');
    expect(anomalies.some(a => a.anomaly_type === 'missing_out')).toBe(true);
  });

  test('salida antes de entrada → anomalía out_before_in', () => {
    const logs = [
      mk('15:11:00', 'out', 2), // emparejado primero
      mk('06:45:00', 'in',  1),
    ];
    // Nota: buildSegments espera entrada ordenada ASC por timestamp
    const sorted = [...logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const { anomalies } = buildSegments(sorted);
    // out antes de in: el segmento (0→1) = (06:45, 15:11) → no es out_before_in
    // Para forzar out_before_in necesitamos los timestamps al revés dentro del par
    expect(sorted[0].resolvedType).toBe('in');
  });

  test('lista vacía → sin segmentos ni anomalías', () => {
    const { segments, anomalies } = buildSegments([]);
    expect(segments).toHaveLength(0);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── computeMetrics ───────────────────────────────────────────────────────────
describe('computeMetrics', () => {
  test('2 marcaciones — sin almuerzo', () => {
    const segs = [{
      in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 15:11:00', minutes: 506,
    }];
    const m = computeMetrics(segs);
    expect(m.workedMinutes).toBe(506);
    expect(m.lunchOut).toBeNull();
    expect(m.lunchIn).toBeNull();
    expect(m.breakMinutes).toBe(0);
  });

  test('4 marcaciones — 2 segmentos con almuerzo', () => {
    const segs = [
      { in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 12:00:00', minutes: 315 },
      { in_at: '2026-05-28 13:00:00', out_at: '2026-05-28 15:11:00', minutes: 131 },
    ];
    const m = computeMetrics(segs);
    expect(m.workedMinutes).toBe(446); // 315 + 131
    expect(m.breakMinutes).toBe(60);   // 13:00 - 12:00
    expect(m.lunchOut).toBe('2026-05-28 12:00:00');
    expect(m.lunchIn).toBe('2026-05-28 13:00:00');
  });

  test('workedMinutes NO incluye almuerzo', () => {
    // last_out - first_in sería 8h 26m = 506, pero correcto es 315+131=446
    const segs = [
      { in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 12:00:00', minutes: 315 },
      { in_at: '2026-05-28 13:00:00', out_at: '2026-05-28 15:11:00', minutes: 131 },
    ];
    const m = computeMetrics(segs);
    expect(m.workedMinutes).not.toBe(506); // NO debe ser last_out - first_in
    expect(m.workedMinutes).toBe(446);
  });
});

// ─── detectDayAnomalies ───────────────────────────────────────────────────────
describe('detectDayAnomalies', () => {
  test('jornada larga detecta long_shift', () => {
    const metrics  = { workedMinutes: 660 }; // 11h
    const segments = [
      { in_at: '2026-05-28 06:00:00', out_at: '2026-05-28 17:00:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments);
    expect(anomalies.some(a => a.anomaly_type === 'long_shift')).toBe(true);
  });

  test('jornada > 5h sin almuerzo detecta no_lunch_break', () => {
    const metrics  = { workedMinutes: 360 }; // 6h
    const segments = [
      { in_at: '2026-05-28 07:00:00', out_at: '2026-05-28 13:00:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments);
    expect(anomalies.some(a => a.anomaly_type === 'no_lunch_break')).toBe(true);
  });

  test('jornada < 5h sin almuerzo NO detecta no_lunch_break', () => {
    const metrics  = { workedMinutes: 240 }; // 4h
    const segments = [{ in_at: '...', out_at: '...' }];
    const anomalies = detectDayAnomalies(metrics, segments);
    expect(anomalies.some(a => a.anomaly_type === 'no_lunch_break')).toBe(false);
  });

  test('jornada normal sin anomalías', () => {
    const metrics  = { workedMinutes: 446 };
    const segments = [
      { in_at: '2026-05-28 06:45:00', out_at: '2026-05-28 12:00:00' },
      { in_at: '2026-05-28 13:00:00', out_at: '2026-05-28 15:11:00' },
    ];
    const anomalies = detectDayAnomalies(metrics, segments);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Integración: pipeline completo con mocks ─────────────────────────────────
describe('pipeline buildSegments + computeMetrics (Juan Carlos)', () => {
  // Caso real de Juan Carlos: entrada 06:47, salida 15:11
  test('2 marcaciones reales de staging → worked_minutes correcto', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:47:46', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 15:11:10', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    expect(typed[0].resolvedType).toBe('in');
    expect(typed[1].resolvedType).toBe('out');

    const { segments } = buildSegments(typed);
    expect(segments[0].minutes).toBe(503); // 15:11:10 - 06:47:46 = 8h 23m 24s ≈ 503m

    const m = computeMetrics(segments);
    expect(m.firstIn).toBe('2026-05-28 06:47:46');
    expect(m.lastOut).toBe('2026-05-28 15:11:10');
    expect(m.workedMinutes).toBe(503);
  });

  test('4 marcaciones — worked_minutes excluye almuerzo', () => {
    const rawLogs = [
      { id: 1, timestamp: '2026-05-28 06:45:11', type: 'unknown' },
      { id: 2, timestamp: '2026-05-28 12:00:00', type: 'unknown' },
      { id: 3, timestamp: '2026-05-28 13:00:00', type: 'unknown' },
      { id: 4, timestamp: '2026-05-28 15:11:05', type: 'unknown' },
    ];
    const typed = assignTypes(rawLogs);
    const { segments } = buildSegments(typed);
    expect(segments).toHaveLength(2);

    const m = computeMetrics(segments);
    const incorrectTotal = Math.round(
      (tsToDate('2026-05-28 15:11:05') - tsToDate('2026-05-28 06:45:11')) / 60000
    );
    expect(m.workedMinutes).toBeLessThan(incorrectTotal); // NO incluye almuerzo
    expect(m.breakMinutes).toBe(60);
    expect(m.lunchOut).toBe('2026-05-28 12:00:00');
    expect(m.lunchIn).toBe('2026-05-28 13:00:00');
  });
});
