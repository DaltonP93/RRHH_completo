/**
 * zkManager.js
 * Manejo de conexión a relojes ZKTeco via node-zklib (ZKProtocol)
 *
 * Soporta:
 *   - Modo auto (TCP con fallback UDP) — default, modelos modernos
 *   - Modo TCP forzado — ZMM100_TFT, ZMM200_TFT, etc.
 *   - Modo UDP forzado — modelos antiguos como GT200
 *   - Contraseña de comunicación (commkey) — si está configurada en el panel
 *   - Timeout configurable por reloj
 *
 * Parámetros por device:
 *   { ip, port, connection_mode: 'auto'|'tcp'|'udp', comm_password, timeout_ms }
 */

const net = require('net');
const ZKLib = require('node-zklib');
const ZKLibTCP = require('node-zklib/zklibtcp');
const ZKLibUDP = require('node-zklib/zklibudp');

// Resolver parámetros efectivos desde un device
function opts(device) {
  return {
    ip: device.ip || device.ip_address,
    port: parseInt(device.port || 4370),
    mode: (device.connection_mode || 'auto').toLowerCase(),
    timeout: parseInt(device.timeout_ms || 10000),
    commKey: device.comm_password ? String(device.comm_password) : null,
    inPort: 0,
  };
}

// Construir el handler según el modo
async function openConnection(o) {
  if (o.mode === 'udp') {
    const udp = new ZKLibUDP(o.ip, o.port, o.timeout, o.inPort);
    await udp.createSocket();
    await udp.connect();
    return { kind: 'udp', client: udp };
  }
  if (o.mode === 'tcp') {
    const tcp = new ZKLibTCP(o.ip, o.port, o.timeout);
    await tcp.createSocket();
    await tcp.connect();
    return { kind: 'tcp', client: tcp };
  }
  // auto — usar ZKLib que intenta TCP y cae a UDP
  const zk = new ZKLib(o.ip, o.port, o.timeout, o.inPort);
  await zk.createSocket();
  return { kind: 'auto', client: zk };
}

async function closeConnection(conn) {
  try {
    if (conn.kind === 'auto') await conn.client.disconnect();
    else await conn.client.disconnect();
  } catch {}
}

// Reutilizamos métodos de ZKLib para TCP/UDP directos
async function getInfoDirect(conn) {
  if (conn.kind === 'auto') return conn.client.getInfo();
  return conn.client.getInfo();
}
async function getAttendancesDirect(conn) {
  if (conn.kind === 'auto') return conn.client.getAttendances();
  return conn.client.getAttendances();
}
async function getUsersDirect(conn) {
  if (conn.kind === 'auto') return conn.client.getUsers();
  return conn.client.getUsers();
}

/**
 * Sincronizar un reloj y devolver marcajes nuevos
 */
async function syncDevice(device, afterTs) {
  const o = opts(device);
  const conn = await openConnection(o);
  try {
    const result = await getAttendancesDirect(conn);
    const records = result.data || result || [];

    const filtered = afterTs
      ? records.filter(r => new Date(r.timestamp) > new Date(afterTs))
      : records;

    return filtered.map(r => ({
      userId:    String(r.userId),
      timestamp: r.timestamp,
      state:     r.state,
      type:      r.type,
      deviceIp:  o.ip,
    }));
  } finally {
    await closeConnection(conn);
  }
}

/**
 * Conectar a un reloj y obtener info básica
 */
async function connectToDevice(device) {
  const o = opts(device);
  let conn;
  try {
    conn = await openConnection(o);
    const info = await getInfoDirect(conn);
    return { ok: true, info, mode: conn.kind };
  } catch (err) {
    return { ok: false, error: err.message || String(err), mode: o.mode };
  } finally {
    if (conn) await closeConnection(conn);
  }
}

/**
 * Obtener todos los usuarios registrados en el reloj
 */
async function getDeviceUsers(device) {
  const o = opts(device);
  let conn;
  try {
    conn = await openConnection(o);
    const result = await getUsersDirect(conn);
    return result.data || result || [];
  } catch {
    return [];
  } finally {
    if (conn) await closeConnection(conn);
  }
}

/**
 * Diagnóstico detallado — prueba cada etapa de conexión paso a paso
 * y devuelve un reporte. Útil cuando el reloj da error genérico.
 */
async function diagnoseDevice(device) {
  const o = opts(device);
  const report = {
    device: { ip: o.ip, port: o.port, mode_configured: o.mode, timeout_ms: o.timeout, has_commkey: !!o.commKey },
    steps: [],
    recommendation: null,
  };

  // Paso 1 — TCP raw connect (socket abrible)
  const tcpOk = await new Promise(resolve => {
    const sock = net.createConnection({ host: o.ip, port: o.port, timeout: 3000 });
    let done = false;
    const finish = (ok, err) => {
      if (done) return; done = true;
      sock.destroy();
      resolve({ ok, err });
    };
    sock.on('connect', () => finish(true));
    sock.on('timeout', () => finish(false, 'timeout 3s'));
    sock.on('error', e => finish(false, e.code || e.message));
  });
  report.steps.push({ step: 'tcp_socket', ok: tcpOk.ok, detail: tcpOk.err || 'socket abierto OK' });

  // Paso 2 — ZKTeco handshake TCP
  const tcpZk = await (async () => {
    try {
      const tcp = new ZKLibTCP(o.ip, o.port, Math.min(o.timeout, 8000));
      await tcp.createSocket();
      await tcp.connect();
      try { await tcp.getInfo(); } catch {}
      try { await tcp.disconnect(); } catch {}
      return { ok: true };
    } catch (err) {
      return { ok: false, err: err.message || String(err) };
    }
  })();
  report.steps.push({ step: 'zkteco_tcp_handshake', ok: tcpZk.ok, detail: tcpZk.err || 'handshake OK' });

  // Paso 3 — ZKTeco UDP handshake
  const udpZk = await (async () => {
    try {
      const udp = new ZKLibUDP(o.ip, o.port, Math.min(o.timeout, 8000), 0);
      await udp.createSocket();
      await udp.connect();
      try { await udp.getInfo(); } catch {}
      try { await udp.disconnect(); } catch {}
      return { ok: true };
    } catch (err) {
      return { ok: false, err: err.message || String(err) };
    }
  })();
  report.steps.push({ step: 'zkteco_udp_handshake', ok: udpZk.ok, detail: udpZk.err || 'handshake UDP OK' });

  // Recomendación
  if (!tcpOk.ok) {
    report.recommendation = 'El reloj no es alcanzable vía TCP. Verificar red / firewall / que el reloj esté encendido.';
  } else if (tcpZk.ok) {
    report.recommendation = 'TCP funciona. Configure connection_mode=tcp.';
  } else if (udpZk.ok) {
    report.recommendation = 'UDP funciona pero TCP no. Configure connection_mode=udp (típico en modelos antiguos como GT200).';
  } else if (tcpOk.ok && !tcpZk.ok && !udpZk.ok) {
    report.recommendation = 'El reloj acepta TCP pero ningún handshake ZKTeco responde. Causas probables: (1) otro software (Attendance Management) conectado — cerrarlo; (2) contraseña de comunicación configurada — ingresarla en comm_password; (3) reloj en uso por otro proceso del bridge.';
  }
  report.summary = report.steps.map(s => `${s.ok ? '✓' : '✗'} ${s.step}`).join(' · ');
  return report;
}

module.exports = { syncDevice, connectToDevice, getDeviceUsers, diagnoseDevice };
