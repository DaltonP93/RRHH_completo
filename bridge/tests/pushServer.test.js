/**
 * Tests del parser y endpoints PUSH del Bridge.
 * No arranca puerto real — usa supertest sobre la app Express interna.
 */

const request = require('supertest');
const express = require('express');

// Reimplementamos un logger mudo para el test
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

// Cargar el pushServer como módulo y arrancar una instancia de app para cada suite
// Trick: el startPushServer crea el app internamente. Lo parcheamos para exponer la app sin escuchar.
function bootApp(opts = {}) {
  // Mock de app.listen para evitar bind real
  const originalListen = express.application.listen;
  let capturedApp;
  express.application.listen = function () {
    capturedApp = this;
    return { close() {} };
  };

  const publishAttendance = jest.fn();
  const { startPushServer } = require('../src/pushServer');
  // Reset module cache por si otro test mutó env
  startPushServer(publishAttendance, logger, opts);

  express.application.listen = originalListen;
  return { app: capturedApp, publishAttendance };
}

describe('pushServer - registro (GET /iclock/cdata)', () => {
  afterEach(() => { delete process.env.ZKTECO_PUSH_WHITELIST; });

  test('responde 200 con config para SN permitido', async () => {
    const { app } = bootApp();
    const res = await request(app).get('/iclock/cdata?SN=TEST01&options=all');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Realtime=1');
    expect(res.text).toContain('TransFlag=TransData AttLog');
  });

  test('respeta whitelist — rechaza SN no autorizado', async () => {
    process.env.ZKTECO_PUSH_WHITELIST = '101,103';
    const { app } = bootApp();
    const res = await request(app).get('/iclock/cdata?SN=999&options=all');
    expect(res.status).toBe(403);
  });

  test('permite SN en la whitelist', async () => {
    process.env.ZKTECO_PUSH_WHITELIST = '101,103';
    const { app } = bootApp();
    const res = await request(app).get('/iclock/cdata?SN=101&options=all');
    expect(res.status).toBe(200);
  });
});

describe('pushServer - ATTLOG (POST /iclock/cdata)', () => {
  test('parsea una línea simple y llama publishAttendance', async () => {
    const { app, publishAttendance } = bootApp();
    const body = '123\t2026-04-17 08:30:00\t0\t1\t0';
    const res = await request(app)
      .post('/iclock/cdata?SN=TEST01&table=ATTLOG')
      .set('Content-Type', 'text/plain')
      .send(body);

    expect(res.status).toBe(200);
    expect(publishAttendance).toHaveBeenCalledTimes(1);
    const payload = publishAttendance.mock.calls[0][0];
    expect(payload.employeeCode).toBe('123');
    expect(payload.deviceSn).toBe('TEST01');
    expect(payload.type).toBe('in');
    expect(new Date(payload.timestamp).toISOString()).toBeDefined();
  });

  test('parsea múltiples líneas separadas por \\n', async () => {
    const { app, publishAttendance } = bootApp();
    const body = [
      '1\t2026-04-17 08:00:00\t0\t1\t0',
      '1\t2026-04-17 12:00:00\t1\t1\t0',
      '1\t2026-04-17 13:00:00\t0\t1\t0',
    ].join('\n');
    await request(app)
      .post('/iclock/cdata?SN=TEST01&table=ATTLOG')
      .set('Content-Type', 'text/plain')
      .send(body);
    expect(publishAttendance).toHaveBeenCalledTimes(3);
    expect(publishAttendance.mock.calls[0][0].type).toBe('in');
    expect(publishAttendance.mock.calls[1][0].type).toBe('out');
    expect(publishAttendance.mock.calls[2][0].type).toBe('in');
  });

  test('ignora líneas vacías', async () => {
    const { app, publishAttendance } = bootApp();
    const body = '\n1\t2026-04-17 08:00:00\t0\t1\t0\n\n';
    await request(app)
      .post('/iclock/cdata?SN=TEST01&table=ATTLOG')
      .set('Content-Type', 'text/plain')
      .send(body);
    expect(publishAttendance).toHaveBeenCalledTimes(1);
  });

  test('ignora fecha inválida', async () => {
    const { app, publishAttendance } = bootApp();
    const body = '1\tFECHA-MAL\t0\t1\t0';
    await request(app)
      .post('/iclock/cdata?SN=TEST01&table=ATTLOG')
      .set('Content-Type', 'text/plain')
      .send(body);
    expect(publishAttendance).not.toHaveBeenCalled();
  });

  test('ignora líneas con pocos campos', async () => {
    const { app, publishAttendance } = bootApp();
    await request(app)
      .post('/iclock/cdata?SN=TEST01&table=ATTLOG')
      .set('Content-Type', 'text/plain')
      .send('soloUnCampo');
    expect(publishAttendance).not.toHaveBeenCalled();
  });

  test('dedupe con Redis descarta segundo POST idéntico', async () => {
    const seen = new Set();
    const redis = {
      isReady: true,
      set: jest.fn(async (key, val, opts) => {
        if (seen.has(key)) return null;
        seen.add(key); return 'OK';
      })
    };
    const { app, publishAttendance } = bootApp({ redis });
    const body = '1\t2026-04-17 08:00:00\t0\t1\t0';

    await request(app).post('/iclock/cdata?SN=DEDUPE&table=ATTLOG')
      .set('Content-Type', 'text/plain').send(body);
    await request(app).post('/iclock/cdata?SN=DEDUPE&table=ATTLOG')
      .set('Content-Type', 'text/plain').send(body);

    expect(publishAttendance).toHaveBeenCalledTimes(1);
  });
});

describe('pushServer - heartbeat (/iclock/getrequest)', () => {
  test('responde OK', async () => {
    const { app } = bootApp();
    const res = await request(app).get('/iclock/getrequest?SN=TEST01');
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });
});

describe('pushServer - estado (/push-state)', () => {
  test('expone JSON con el SN tras registro', async () => {
    const { app } = bootApp();
    await request(app).get('/iclock/cdata?SN=STATE_TEST');
    const res = await request(app).get('/push-state');
    expect(res.status).toBe(200);
    expect(res.body.STATE_TEST).toBeDefined();
    expect(res.body.STATE_TEST.lastSeen).toBeDefined();
  });
});
