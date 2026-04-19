const { createClient } = require('redis');
const logger = require('./logger');

let client;
let subscriber;

async function initRedis() {
  client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  subscriber = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

  client.on('error', err => logger.error('Redis error:', err));
  subscriber.on('error', err => logger.error('Redis subscriber error:', err));

  await client.connect();
  await subscriber.connect();

  // Suscribirse al canal de marcajes del Bridge ZKTeco
  await subscriber.subscribe('attendance:new', async (message) => {
    try {
      const data = JSON.parse(message);
      const { processAttendanceEvent } = require('../controllers/attendanceController');
      await processAttendanceEvent(data);
    } catch (err) {
      logger.error('Error procesando evento de asistencia:', err);
    }
  });

  await subscriber.subscribe('device:status', async (message) => {
    try {
      const data = JSON.parse(message);
      const { io } = require('../socket/socketServer');
      io.emit('device:status', data);
    } catch (err) {
      logger.error('Error en device:status:', err);
    }
  });

  // Alertas del Bridge (heartbeat perdido / recuperado)
  await subscriber.subscribe('device:alert', async (message) => {
    try {
      const data = JSON.parse(message);
      const { getIO } = require('../socket/socketServer');
      try { getIO().to('role:admin').to('role:gestor').emit('device:alert', data); } catch {}
      logger.warn(`🚨 device:alert — ${data.type} SN=${data.sn} (${data.ip})`);
    } catch (err) {
      logger.error('Error en device:alert:', err);
    }
  });

  return client;
}

function getRedis() {
  if (!client) throw new Error('Redis no inicializado');
  return client;
}

module.exports = { initRedis, getRedis };
