'use strict';
/**
 * Tests para la aprobación de jornada para nómina.
 * Valida flujo approve/reopen e invariante de inmutabilidad.
 */

jest.mock('../src/config/database', () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock('../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { sequelize } = require('../src/config/database');

beforeEach(() => {
  sequelize.query.mockReset();
});

function makeReq(overrides = {}) {
  return {
    user: { id: 10, role: 'hr' },
    body: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

const router = require('../src/routes/dayApproval');

function getHandler(method, path) {
  for (const layer of (router.stack || [])) {
    if (!layer.route) continue;
    if (layer.route.methods[method] && layer.route.path === path) {
      const handlers = layer.route.stack;
      return handlers[handlers.length - 1].handle;
    }
  }
  return null;
}

// ─── APPROVE ────────────────────────────────────────────────────────────────
describe('PUT /:employee_id/:date/approve', () => {
  const handler = () => getHandler('put', '/:employee_id/:date/approve');

  test('400 si employee_id no es entero', async () => {
    const req = makeReq({ params: { employee_id: 'abc', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  test('400 si date tiene formato inválido', async () => {
    const req = makeReq({ params: { employee_id: '927', date: '28-05-2026' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 si no existe daily_summary', async () => {
    sequelize.query.mockResolvedValueOnce([[]]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 si ya está approved', async () => {
    sequelize.query.mockResolvedValueOnce([[{ id: 1, calculation_status: 'approved', requires_review: 0 }]]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('422 si hay anomalías sin resolver (missing_out)', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'adjusted', requires_review: 1 }]])
      .mockResolvedValueOnce([[{ cnt: 1 }]]); // 1 anomalía sin resolver
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      unresolved_anomalies: 1,
    }));
  });

  test('422 si hay ajustes pendientes', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'adjusted', requires_review: 0 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // sin anomalías
      .mockResolvedValueOnce([[{ cnt: 2 }]]); // 2 ajustes pending
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      pending_adjustments: 2,
    }));
  });

  test('aprobación exitosa tras add_punch que cerró missing_out', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'adjusted', requires_review: 0 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // sin anomalías (missing_out fue cerrado)
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // sin ajustes pending
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE daily_summary
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      calculation_status: 'approved',
    }));

    // Verificar que el UPDATE fue a daily_summary, no a attendance_logs
    const updateCall = sequelize.query.mock.calls[3];
    expect(updateCall[0]).toMatch(/UPDATE daily_summary/);
    expect(updateCall[0]).toMatch(/approved/);
    expect(updateCall[1].replacements).toContain(10); // user id
  });

  test('aprobación no modifica attendance_logs', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'adjusted', requires_review: 0 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());

    for (const call of sequelize.query.mock.calls) {
      const sql = String(call[0]).toUpperCase();
      expect(sql).not.toMatch(/INSERT\s+INTO\s+ATTENDANCE_LOGS/);
      expect(sql).not.toMatch(/UPDATE\s+ATTENDANCE_LOGS/);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+ATTENDANCE_LOGS/);
    }
  });
});

// ─── REOPEN ─────────────────────────────────────────────────────────────────
describe('PUT /:employee_id/:date/reopen', () => {
  const handler = () => getHandler('put', '/:employee_id/:date/reopen');

  test('404 si no existe daily_summary', async () => {
    sequelize.query.mockResolvedValueOnce([[]]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 si no está approved', async () => {
    sequelize.query.mockResolvedValueOnce([[{ id: 1, calculation_status: 'adjusted' }]]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('reopen exitoso vuelve a adjusted si hay ajustes aprobados', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'approved' }]])
      .mockResolvedValueOnce([[{ cnt: 3 }]]) // 3 ajustes aprobados
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      calculation_status: 'adjusted',
    }));
  });

  test('reopen exitoso vuelve a provisional si no hay ajustes aprobados', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'approved' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // sin ajustes aprobados
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      calculation_status: 'provisional',
    }));
  });

  test('reopen no modifica attendance_logs', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'approved' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler()(req, res, jest.fn());

    for (const call of sequelize.query.mock.calls) {
      const sql = String(call[0]).toUpperCase();
      expect(sql).not.toMatch(/INSERT\s+INTO\s+ATTENDANCE_LOGS/);
      expect(sql).not.toMatch(/UPDATE\s+ATTENDANCE_LOGS/);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+ATTENDANCE_LOGS/);
    }
  });
});

// ─── approved impacta day-timeline ──────────────────────────────────────────
describe('approved impacta day-timeline', () => {
  test('approved se refleja en calculation_status del GET day-timeline', async () => {
    // Este test verifica indirectamente: el UPDATE pone calculation_status='approved'
    // y el GET /day-timeline lo lee de daily_summary.calculation_status.
    // Verificamos que el UPDATE es correcto.
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1, calculation_status: 'adjusted', requires_review: 0 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const handler = getHandler('put', '/:employee_id/:date/approve');
    const req = makeReq({ params: { employee_id: '927', date: '2026-05-28' } });
    const res = makeRes();
    await handler(req, res, jest.fn());

    const updateSql = sequelize.query.mock.calls[3][0];
    expect(updateSql).toMatch(/calculation_status\s*=\s*'approved'/);
    expect(updateSql).toMatch(/requires_review\s*=\s*0/);
    expect(updateSql).toMatch(/approved_by\s*=\s*\?/);
    expect(updateSql).toMatch(/approved_at\s*=\s*NOW\(\)/);
  });
});
