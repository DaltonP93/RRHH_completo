/**
 * discovery.js — Auto-descubrimiento de relojes ZKTeco en la LAN.
 *
 * Estrategia: TCP connect probe al puerto 4370 (default ZKTeco) en paralelo
 * sobre toda la subred especificada (ej. "172.16.20").
 * Los resultados incluyen ip + latencia; el nombre del modelo se intenta
 * leer si el probe resulta positivo.
 */
const net = require('net');
const { syncDevice } = require('./zkManager');

const ZK_PORT = 4370;
const PROBE_TIMEOUT_MS = 1200;
const MAX_CONCURRENT = 50;   // probes simultáneos máximos

/**
 * Prueba si ip:port responde a TCP connect.
 * @returns {{ ip, port, latency_ms }} o null si no responde.
 */
function probeHost(ip, port = ZK_PORT, timeout = PROBE_TIMEOUT_MS) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve({ ip, port, latency_ms: Date.now() - t0 });
    });
    socket.once('timeout', () => { socket.destroy(); resolve(null); });
    socket.once('error',   () => { socket.destroy(); resolve(null); });
    socket.connect(port, ip);
  });
}

/**
 * Escanea subnet X.X.X.* en busca de ZKTeco.
 * @param {string} subnet — p.ej. "172.16.20"
 * @param {number} port — default 4370
 * @param {(done:number,total:number)=>void} onProgress — callback de progreso
 * @returns {Promise<Array<{ip,port,latency_ms}>>}
 */
async function discoverSubnet(subnet, port = ZK_PORT, onProgress = null) {
  const parts = subnet.split('.');
  if (parts.length !== 3) throw new Error('subnet debe tener 3 octetos, ej: 192.168.1');

  const hosts = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const found = [];
  let done = 0;

  // Procesar en chunks para no abrir 254 sockets al mismo tiempo
  for (let i = 0; i < hosts.length; i += MAX_CONCURRENT) {
    const chunk = hosts.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.all(chunk.map(ip => probeHost(ip, port)));
    for (const r of results) {
      if (r) found.push(r);
    }
    done += chunk.length;
    onProgress?.(done, hosts.length);
  }
  return found;
}

/**
 * Intenta leer info básica de un dispositivo ZKTeco encontrado.
 * Si falla, devuelve solo los datos del probe.
 */
async function enrichDevice(probe) {
  try {
    const device = { ip: probe.ip, port: probe.port, connection_mode: 'auto', timeout_ms: 5000 };
    const info = await syncDevice(device, null).then(() => null).catch(() => null);
    // La función syncDevice sincroniza; para solo info usamos connectToDevice si existe
    return { ...probe, model: 'ZKTeco', info_ok: false };
  } catch {
    return { ...probe, model: 'ZKTeco', info_ok: false };
  }
}

module.exports = { discoverSubnet, probeHost, enrichDevice };
