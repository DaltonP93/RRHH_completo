'use strict';
/**
 * Tests para api/src/routes/att2000Sync.js
 * Mockea att2000.js y sequelize — no requiere SQL Server ni MySQL reales.
 */

const request = require('supertest');
const express = require('express');

// ─── Mocks ────────────────────────────────────────────────────────
jest.mock('../src/config/database', () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock('../src/config/att2000', () => ({
  testAtt2000Connection:  jest.fn(),
  diagnoseAtt2000Schema:  jest.fn(),
  getAtt2000TableCounts:  jest.fn(),
  getAtt2000DateRange:    jest.fn(),
  fetchAttDepartments:    jest.fn(),
  fetchAttUsers:          jest.fn(),
  fetchAttPunches:        jest.fn(),
  fetchAttPunchesSince:   jest.fn(),
  resetPool:              jest.fn(),
}));

jest.mock('../src/config/logger', () => ({
  info:  jest.fn(),
  error: jest.fn(),
  warn:  jest.fn(),
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 1, role: 'admin' };
    next();
  },
  authorize: (..._roles) => (_req, _res, next) => next(),
}));

const { sequelize } = require('../src/config/database');
const att2000 = require('../src/config/att2000');
const router = require('../src/routes/att2000Sync');

// ─── App de prueba ────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  return app;
}

// Helper: simula getSourceSystemId() que hace query 'att2000'
function mockSourceSystem(id = 1) {
  sequelize.query.mockImplementationOnce(() => [[{ id }]]);
}

// ─── Tests ───────────────────────────────────────────────────────
describe('GET /diagnose', () => {
  it('devuelve connection, schema, counts, date_range', async () => {
    att2000.testAtt2000Connection.mockResolvedValue({ ok: true, totalRecords: 1000 });
    att2000.diagnoseAtt2000Schema.mockResolvedValue([{ TABLE_NAME: 'CHECKINOUT', col_count: 7 }]);
    att2000.getAtt2000TableCounts.mockResolvedValue({ CHECKINOUT: 1000 });
    att2000.getAtt2000DateRange.mockResolvedValue({ min_date: '2020-01-01', max_date: '2024-12-31', total: 1000 });

    const res = await request(buildApp()).get('/diagnose');
    expect(res.status).toBe(200);
    expect(res.body.connection.ok).toBe(true);
    expect(res.body.schema).toHaveLength(1);
    expect(res.body.counts.CHECKINOUT).toBe(1000);
    expect(res.body.date_range.total).toBe(1000);
  });

  it('maneja error de conexion con allSettled', async () => {
    att2000.testAtt2000Connection.mockRejectedValue(new Error('timeout'));
    att2000.diagnoseAtt2000Schema.mockResolvedValue([]);
    att2000.getAtt2000TableCounts.mockResolvedValue({});
    att2000.getAtt2000DateRange.mockResolvedValue(null);

    const res = await request(buildApp()).get('/diagnose');
    expect(res.status).toBe(200);
    expect(res.body.connection.ok).toBe(false);
    expect(res.body.connection.error).toBe('timeout');
  });
});

describe('POST /test-connection', () => {
  it('llama resetPool y testAtt2000Connection', async () => {
    att2000.testAtt2000Connection.mockResolvedValue({ ok: true, totalRecords: 500 });

    const res = await request(buildApp())
      .post('/test-connection')
      .send({ host: '10.0.0.1', port: 1433, user: 'sa', password: 'pass', database: 'att2000' });

    expect(res.status).toBe(200);
    expect(att2000.resetPool).toHaveBeenCalled();
    expect(res.body.ok).toBe(true);
  });

  it('devuelve 500 si la conexion falla', async () => {
    att2000.resetPool.mockImplementation(() => {});
    att2000.testAtt2000Connection.mockRejectedValue(new Error('connection refused'));

    const res = await request(buildApp()).post('/test-connection').send({});
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});

describe('POST /import-departments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // getSourceSystemId
    sequelize.query.mockResolvedValueOnce([[{ id: 1 }]]);
    // createSyncRun INSERT
    sequelize.query.mockResolvedValueOnce([42]);
    // finishSyncRun UPDATE
    sequelize.query.mockResolvedValue([]);
  });

  it('importa departamentos correctamente', async () => {
    att2000.fetchAttDepartments.mockResolvedValue([
      { DEPTID: 1, DeptName: 'RRHH' },
      { DEPTID: 2, DeptName: 'IT' },
    ]);
    // ON DUPLICATE KEY UPDATE para cada dept
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1 }]])   // getSourceSystemId
      .mockResolvedValueOnce([42])             // createSyncRun
      .mockResolvedValue([]);                  // upsert + finishSyncRun

    const res = await request(buildApp()).post('/import-departments');
    expect(res.status).toBe(200);
    expect(res.body.run_id).toBeDefined();
    expect(typeof res.body.inserted).toBe('number');
  });
});

describe('GET /runs', () => {
  it('devuelve lista de runs', async () => {
    sequelize.query.mockResolvedValue([[
      { id: 1, sync_type: 'full', entity_type: 'punches', status: 'completed', source_name: 'att2000' },
    ]]);

    const res = await request(buildApp()).get('/runs?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(1);
  });
});

describe('GET /runs/:id', () => {
  it('devuelve run por id', async () => {
    sequelize.query.mockResolvedValue([[{ id: 5, status: 'completed' }]]);
    const res = await request(buildApp()).get('/runs/5');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5);
  });

  it('devuelve 404 si no existe', async () => {
    sequelize.query.mockResolvedValue([[null]]);
    const res = await request(buildApp()).get('/runs/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /unknown-events', () => {
  it('devuelve eventos desconocidos', async () => {
    sequelize.query.mockResolvedValue([[
      { id: 1, source_user_id: '123', status: 'pending', normalized_type: 'in' },
    ]]);
    const res = await request(buildApp()).get('/unknown-events?status=pending');
    expect(res.status).toBe(200);
    expect(res.body[0].source_user_id).toBe('123');
  });
});

describe('GET /source-mode', () => {
  it('devuelve el modo actual', async () => {
    sequelize.query.mockResolvedValue([[{ value: 'hybrid' }]]);
    const res = await request(buildApp()).get('/source-mode');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('hybrid');
  });

  it('devuelve legacy_att2000 si no hay setting', async () => {
    sequelize.query.mockResolvedValue([[null]]);
    const res = await request(buildApp()).get('/source-mode');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('legacy_att2000');
  });
});

describe('POST /source-mode', () => {
  it('acepta modos validos', async () => {
    sequelize.query.mockResolvedValue([]);
    for (const mode of ['legacy_att2000', 'hybrid', 'direct_only']) {
      const res = await request(buildApp()).post('/source-mode').send({ mode });
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe(mode);
    }
  });

  it('rechaza modo invalido', async () => {
    const res = await request(buildApp()).post('/source-mode').send({ mode: 'invalid_mode' });
    expect(res.status).toBe(400);
  });
});

describe('GET /employee-map', () => {
  it('devuelve mapa de empleados filtrado', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 1 }]])   // getSourceSystemId
      .mockResolvedValue([[
        { id: 1, source_user_id: '5', raw_name: 'Juan Perez', match_status: 'unmatched' },
      ]]);

    const res = await request(buildApp()).get('/employee-map?status=unmatched');
    expect(res.status).toBe(200);
    expect(res.body[0].match_status).toBe('unmatched');
  });
});

describe('POST /employee-map/:id/assign', () => {
  it('asigna correctamente', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ id: 10, source_user_id: '5', raw_name: 'Test' }]]) // SELECT entry
      .mockResolvedValueOnce([[{ id: 99, first_name: 'Maria', last_name: 'Lopez', code: 'EMP001' }]]) // SELECT emp
      .mockResolvedValue([]); // UPDATE

    const res = await request(buildApp())
      .post('/employee-map/10/assign')
      .send({ employee_id: 99 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.employee.code).toBe('EMP001');
  });

  it('devuelve 400 si falta employee_id', async () => {
    const res = await request(buildApp()).post('/employee-map/1/assign').send({});
    expect(res.status).toBe(400);
  });

  it('devuelve 404 si la entrada no existe', async () => {
    sequelize.query.mockResolvedValue([[null]]);
    const res = await request(buildApp()).post('/employee-map/999/assign').send({ employee_id: 1 });
    expect(res.status).toBe(404);
  });
});
