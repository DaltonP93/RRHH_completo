'use strict';
/**
 * Tests para el módulo de ajustes manuales de marcaciones.
 * Valida el flujo CRUD, aprobación, rechazo e invariante de inmutabilidad.
 */

jest.mock('../src/config/database', () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock('../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../src/services/attendanceProcessor', () => ({
  processAttendanceDay: jest.fn().mockResolvedValue({}),
}));
jest.mock('../src/services/attendancePolicyResolver', () => ({
  resolvePolicy: jest.fn().mockResolvedValue({ auto_deduct_break: false, break_minutes: 0, apply_break_after_minutes: 0 }),
}));

const { sequelize } = require('../src/config/database');
const { processAttendanceDay } = require('../src/services/attendanceProcessor');

// Resetear mocks entre tests para evitar acumulación de calls
beforeEach(() => {
  sequelize.query.mockReset();
  processAttendanceDay.mockReset();
  processAttendanceDay.mockResolvedValue({});
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    user: { id: 10, role: 'hr' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// Carga el router y extrae handlers por método+ruta simulando Express.
// Para simplificar, importamos las funciones del módulo de forma directa
// replicando la lógica del router en los tests.
const router = require('../src/routes/manualAdjustments');

// Extraemos los handlers de las capas del router de Express.
// Stack item: layer.route.path, layer.route.methods, layer.route.stack[last].handle
function getHandler(method, path) {
  const stack = router.stack || [];
  for (const layer of stack) {
    if (!layer.route) continue;
    const routePath = layer.route.path;
    const methods   = layer.route.methods;
    if (methods[method.toLowerCase()] && routePath === path) {
      const handlers = layer.route.stack;
      return handlers[handlers.length - 1].handle;
    }
  }
  return null;
}

// ─── GET /  ───────────────────────────────────────────────────────────────────
describe('GET / — listar ajustes', () => {
  test('400 si falta date (siempre requerido)', async () => {
    const handler = getHandler('get', '/');
    const req = makeReq({ query: { employee_id: '927' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  test('400 si falta employee_id para rol no elevado (viewer)', async () => {
    const handler = getHandler('get', '/');
    const req = makeReq({ query: { date: '2026-05-28' }, user: { id: 10, role: 'viewer' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  test('200 con array de ajustes', async () => {
    sequelize.query.mockResolvedValueOnce([[
      { id: 1, adjustment_type: 'exclude_from_calculation', status: 'pending',
        old_value: '{"timestamp":"2026-05-28 09:00:00"}', new_value: null },
    ]]);
    const handler = getHandler('get', '/');
    const req = makeReq({ query: { date: '2026-05-28', employee_id: '927' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      adjustments: expect.arrayContaining([expect.objectContaining({ id: 1 })]),
    }));
  });

  test('old_value/new_value JSON string se parsea a objeto', async () => {
    sequelize.query.mockResolvedValueOnce([[
      { id: 2, adjustment_type: 'add_punch', status: 'pending',
        old_value: null, new_value: '{"timestamp":"2026-05-28 18:00:00","type":"out"}' },
    ]]);
    const handler = getHandler('get', '/');
    const req = makeReq({ query: { date: '2026-05-28', employee_id: '1' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.adjustments[0].new_value).toEqual({ timestamp: '2026-05-28 18:00:00', type: 'out' });
  });
});

// ─── POST / — crear ajuste ────────────────────────────────────────────────────
describe('POST / — crear ajuste', () => {
  test('400 si faltan campos requeridos', async () => {
    const handler = getHandler('post', '/');
    const req = makeReq({ body: { employee_id: 927 } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 si adjustment_type es inválido', async () => {
    const handler = getHandler('post', '/');
    const req = makeReq({ body: { employee_id: 927, work_date: '2026-05-28', adjustment_type: 'borrar_todo' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: expect.stringContaining('inválido') }));
  });

  test('400 para add_punch sin new_value.timestamp', async () => {
    const handler = getHandler('post', '/');
    const req = makeReq({ body: {
      employee_id: 927, work_date: '2026-05-28',
      adjustment_type: 'add_punch', new_value: { type: 'out' },
    }});
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 para exclude_from_calculation sin original_log_id', async () => {
    const handler = getHandler('post', '/');
    const req = makeReq({ body: {
      employee_id: 927, work_date: '2026-05-28',
      adjustment_type: 'exclude_from_calculation',
    }});
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('201 con datos válidos — no modifica attendance_logs (Sequelize devuelve OkPacket)', async () => {
    sequelize.query.mockResolvedValueOnce([{ insertId: 42 }]);
    const handler = getHandler('post', '/');
    const req = makeReq({ body: {
      employee_id: 927, work_date: '2026-05-28',
      adjustment_type: 'exclude_from_calculation',
      original_log_id: 12973, reason: 'Marcación duplicada',
    }});
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, id: 42 }));

    // Verificar que el INSERT fue a attendance_adjustments, NO a attendance_logs
    const insertCall = sequelize.query.mock.calls[0];
    expect(insertCall[0]).toMatch(/INSERT INTO attendance_adjustments/);
    expect(insertCall[0]).not.toMatch(/attendance_logs/);
  });

  test('201 con datos válidos — Sequelize devuelve insertId como número', async () => {
    // Sequelize a veces devuelve el insertId directamente como número en lugar de OkPacket
    sequelize.query.mockResolvedValueOnce([99]);
    const handler = getHandler('post', '/');
    const req = makeReq({ body: {
      employee_id: 927, work_date: '2026-05-28',
      adjustment_type: 'exclude_from_calculation',
      original_log_id: 12973,
    }});
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, id: 99 }));
  });
});

// ─── PUT /:id/approve ─────────────────────────────────────────────────────────
describe('PUT /:id/approve', () => {
  test('400 si id no es entero válido', async () => {
    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '{id}' }, user: { id: 10, role: 'hr' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  test('404 si ajuste no existe', async () => {
    sequelize.query.mockResolvedValueOnce([[]]); // empty result
    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '999' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 si ajuste no está en pending', async () => {
    sequelize.query.mockResolvedValueOnce([[
      { id: 1, status: 'approved', adjustment_type: 'exclude_from_calculation',
        employee_id: 927, work_date: '2026-05-28', requested_by: 5 },
    ]]);
    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '1' }, user: { id: 10, role: 'hr' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('403 si el solicitante intenta aprobarse a sí mismo', async () => {
    sequelize.query.mockResolvedValueOnce([[
      { id: 1, status: 'pending', adjustment_type: 'exclude_from_calculation',
        employee_id: 927, work_date: '2026-05-28', requested_by: 10 }, // mismo id que req.user
    ]]);
    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '1' }, user: { id: 10, role: 'hr' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('add_punch aprobado crea nuevo attendance_log (no modifica existente)', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{
        id: 2, status: 'pending', adjustment_type: 'add_punch',
        employee_id: 927, work_date: '2026-05-28', requested_by: 5,
        new_value: JSON.stringify({ timestamp: '2026-05-28 18:00:00', type: 'out' }),
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT attendance_logs
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE attendance_adjustments

    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '2' }, user: { id: 10, role: 'hr' } });
    const res = makeRes();
    await handler(req, res, jest.fn());

    // Verificar que se insertó en attendance_logs
    const insertLogCall = sequelize.query.mock.calls[1];
    expect(insertLogCall[0]).toMatch(/INSERT INTO attendance_logs/);
    expect(insertLogCall[1].replacements).toContain('2026-05-28 18:00:00');
    expect(insertLogCall[1].replacements).toContain('out');

    // Verificar que se actualizó attendance_adjustments a 'approved'
    const updateAdjCall = sequelize.query.mock.calls[2];
    expect(updateAdjCall[0]).toMatch(/UPDATE attendance_adjustments/);
    expect(updateAdjCall[0]).toMatch(/approved/);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test('exclude_from_calculation aprobado dispara recálculo', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{
        id: 3, status: 'pending', adjustment_type: 'exclude_from_calculation',
        employee_id: 927, work_date: '2026-05-28', requested_by: 5,
        new_value: null,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE attendance_adjustments

    processAttendanceDay.mockResolvedValueOnce({});

    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '3' }, user: { id: 10, role: 'hr' } });
    const res = makeRes();
    await handler(req, res, jest.fn());

    expect(processAttendanceDay).toHaveBeenCalledWith({ date: '2026-05-28', employeeId: 927 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test('super_admin puede aprobarse a sí mismo', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{
        id: 4, status: 'pending', adjustment_type: 'exclude_from_calculation',
        employee_id: 927, work_date: '2026-05-28', requested_by: 10, // mismo user
        new_value: null,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '4' }, user: { id: 10, role: 'super_admin' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test('add_punch aprobado dispara recálculo y cierra missing_out', async () => {
    // Simula el flujo completo: Cecilia tiene entrada 09:43 sin salida.
    // Al aprobar add_punch con out 17:00, se inserta log y se recalcula el día.
    // processAttendanceDay se llama → motor recomputa sin missing_out.
    sequelize.query
      .mockResolvedValueOnce([[{
        id: 5, status: 'pending', adjustment_type: 'add_punch',
        employee_id: 927, work_date: '2026-05-28', requested_by: 5,
        new_value: JSON.stringify({ timestamp: '2026-05-28 17:00:00', type: 'out' }),
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT attendance_logs
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE attendance_adjustments

    processAttendanceDay.mockResolvedValueOnce({
      anomalies: [],
      summary: { calculation_status: 'adjusted', requires_review: false },
    });

    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '5' }, user: { id: 10, role: 'hr' } });
    const res = makeRes();
    await handler(req, res, jest.fn());

    // El nuevo log insertado en attendance_logs con source = 'manual_adjustment'
    const insertCall = sequelize.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO attendance_logs/);
    expect(insertCall[0]).toMatch(/manual_adjustment/); // literal en el SQL
    expect(insertCall[1].replacements).toContain('2026-05-28 17:00:00');
    expect(insertCall[1].replacements).toContain('out');

    // El recálculo fue llamado con el empleado y fecha correctos
    expect(processAttendanceDay).toHaveBeenCalledWith({ date: '2026-05-28', employeeId: 927 });

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});

// ─── PUT /:id/reject ──────────────────────────────────────────────────────────
describe('PUT /:id/reject', () => {
  test('400 si id no es entero válido', async () => {
    const handler = getHandler('put', '/:id/reject');
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  test('404 si ajuste no existe', async () => {
    sequelize.query.mockResolvedValueOnce([[]]);
    const handler = getHandler('put', '/:id/reject');
    const req = makeReq({ params: { id: '999' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 si ajuste no está en pending', async () => {
    sequelize.query.mockResolvedValueOnce([[
      { id: 5, status: 'rejected', adjustment_type: 'add_punch',
        employee_id: 927, work_date: '2026-05-28' },
    ]]);
    const handler = getHandler('put', '/:id/reject');
    const req = makeReq({ params: { id: '5' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('rechazo exitoso', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{
        id: 6, status: 'pending', adjustment_type: 'exclude_from_calculation',
        employee_id: 927, work_date: '2026-05-28',
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const handler = getHandler('put', '/:id/reject');
    const req = makeReq({ params: { id: '6' }, body: { reason: 'No corresponde' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test('rechazo NO dispara recálculo', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{
        id: 7, status: 'pending', adjustment_type: 'exclude_from_calculation',
        employee_id: 927, work_date: '2026-05-28',
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    processAttendanceDay.mockClear();
    const handler = getHandler('put', '/:id/reject');
    const req = makeReq({ params: { id: '7' } });
    const res = makeRes();
    await handler(req, res, jest.fn());
    expect(processAttendanceDay).not.toHaveBeenCalled();
  });
});

// ─── Invariante de inmutabilidad ─────────────────────────────────────────────
describe('Invariante de inmutabilidad de attendance_logs', () => {
  test('ninguna operación de ajuste emite DELETE en attendance_logs', async () => {
    // Simular aprobación de exclude_from_calculation
    sequelize.query.mockReset();
    sequelize.query
      .mockResolvedValueOnce([[{
        id: 10, status: 'pending', adjustment_type: 'exclude_from_calculation',
        employee_id: 927, work_date: '2026-05-28', requested_by: 5, new_value: null,
      }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    const handler = getHandler('put', '/:id/approve');
    const req = makeReq({ params: { id: '10' }, user: { id: 10, role: 'hr' } });
    const res = makeRes();
    await handler(req, res, jest.fn());

    for (const call of sequelize.query.mock.calls) {
      const sql = String(call[0]).toUpperCase();
      expect(sql).not.toMatch(/DELETE\s+FROM\s+ATTENDANCE_LOGS/);
      expect(sql).not.toMatch(/UPDATE\s+ATTENDANCE_LOGS/);
    }
  });

  test('ajuste pendiente no altera daily_summary ni attendance_logs', async () => {
    sequelize.query.mockReset();
    sequelize.query.mockResolvedValueOnce([{ insertId: 99 }]);

    const handler = getHandler('post', '/');
    const req = makeReq({ body: {
      employee_id: 927, work_date: '2026-05-28',
      adjustment_type: 'exclude_from_calculation', original_log_id: 1,
    }});
    const res = makeRes();
    await handler(req, res, jest.fn());

    for (const call of sequelize.query.mock.calls) {
      const sql = String(call[0]).toUpperCase();
      expect(sql).not.toMatch(/UPDATE\s+ATTENDANCE_LOGS/);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+ATTENDANCE_LOGS/);
      expect(sql).not.toMatch(/UPDATE\s+DAILY_SUMMARY/);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+DAILY_SUMMARY/);
    }
    expect(processAttendanceDay).not.toHaveBeenCalled();
  });
});
