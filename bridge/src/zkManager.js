/**
 * zkManager.js
 * Manejo de conexión a relojes ZKTeco via node-zklib (ZKProtocol)
 *
 * node-zklib docs: https://github.com/adrobinoga/node-zklib
 *
 * IMPORTANTE: Algunos modelos ZKTeco usan protocolo UDP y otros TCP.
 * Si falla la conexión, verifica el modelo en el panel del reloj.
 */

const ZKLib = require('node-zklib');

/**
 * Sincronizar un reloj y devolver marcajes nuevos
 * @param {Object} device  - { ip, port, id }
 * @param {string} afterTs - ISO string, solo traer marcajes después de esta fecha
 * @returns {Array}        - Array de { userId, timestamp, ... }
 */
async function syncDevice(device, afterTs) {
  const zk = new ZKLib(device.ip, device.port, 10000, 4000);
  let socket;

  try {
    socket = await zk.createSocket();
    const result = await zk.getAttendances((percent) => {
      // progreso de descarga (útil si hay miles de registros)
    });

    const records = result.data || [];

    // Filtrar solo registros nuevos
    const filtered = afterTs
      ? records.filter(r => new Date(r.timestamp) > new Date(afterTs))
      : records;

    return filtered.map(r => ({
      userId:    String(r.userId),
      timestamp: r.timestamp,
      state:     r.state,
      type:      r.type,
      deviceIp:  device.ip
    }));
  } finally {
    if (socket) {
      try { await zk.disconnect(); } catch {}
    }
  }
}

/**
 * Conectar a un reloj y obtener info básica (para verificar conectividad)
 */
async function connectToDevice(device) {
  const zk = new ZKLib(device.ip, device.port, 5000, 2000);
  try {
    await zk.createSocket();
    const info = await zk.getInfo();
    await zk.disconnect();
    return { ok: true, info };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Obtener todos los usuarios registrados en el reloj
 */
async function getDeviceUsers(device) {
  const zk = new ZKLib(device.ip, device.port, 10000, 4000);
  try {
    await zk.createSocket();
    const result = await zk.getUsers();
    await zk.disconnect();
    return result.data || [];
  } catch (err) {
    return [];
  }
}

module.exports = { syncDevice, connectToDevice, getDeviceUsers };
