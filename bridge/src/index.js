/**
 * ZKTeco Bridge Service
 * Conexión DIRECTA a los relojes biométricos — sin depender del
 * ZK Attendance Management Program.
 *
 * Relojes configurados:
 *   - Reloj Comedor:   172.16.20.160:4370  (3000T-C/ID, MachineNo: 101)
 *   - Reloj Lavadero:  172.16.20.161:4370  (GT200,      MachineNo: 103)
 *   - Reloj Gerencia:  172.16.20.162:4370  (3000T-C,    MachineNo: 1)
 *
 * Modos de operación:
 *   1. PUSH  — El reloj envía marcajes en tiempo real (puerto 8080)
 *   2. POLL  — El Bridge jala datos del reloj cada N segundos (ZKLib)
 */

require('dotenv').config();
const express = require('express');
const { createClient } = require('redis');
const winston = require('winston');

const { syncDevice, connectToDevice, getDeviceUsers } = require('./zkManager');
const { startPushServer } = require('./pushServer');

// ─── Logger ─────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp} [${level}] ${message}`)
  ),
  transports: [new winston.transports.Console()]
});

// ─── Relojes configurados (se pueden sobreescribir con ZKTECO_DEVICES) ──
const DEFAULT_DEVICES = [
  { id: 101, name: 'Reloj Comedor',  ip: '172.16.20.160', port: 4370 },
  { id: 103, name: 'Reloj Lavadero', ip: '172.16.20.161', port: 4370 },
  { id: 1,   name: 'Reloj Gerencia', ip: '172.16.20.162', port: 4370 },
];

function getDevices() {
  const envDevices = process.env.ZKTECO_DEVICES;
  if (envDevices) {
    return envDevices.split(',').map((entry, idx) => {
      const [ip, port] = entry.trim().split(':');
      return { id: idx + 1, name: `Reloj ${idx + 1}`, ip, port: parseInt(port || '4370') };
    });
  }
  return DEFAULT_DEVICES;
}

// ─── Redis ──────────────────────────────────────────────────────
let redis;

async function initRedis() {
  redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  redis.on('error', err => logger.error('Redis: ' + err.message));
  await redis.connect();
  logger.info('✅ Redis conectado');
}

// ─── Publicar evento de asistencia en tiempo real ───────────────
async function publishAttendance(event) {
  if (!redis?.isReady) return;
  await redis.publish('attendance:new', JSON.stringify(event));
  logger.info(`📡 Marcaje: ${event.deviceName || event.deviceIp} | Empleado: ${event.employeeCode} | ${event.timestamp}`);
}

async function publishDeviceStatus(device, status, error = null) {
  if (!redis?.isReady) return;
  await redis.publish('device:status', JSON.stringify({
    deviceId:   device.id,
    deviceName: device.name,
    ip:         device.ip,
    status,
    error,
    lastSeen:   new Date().toISOString()
  }));

  // Cache del estado en Redis para el dashboard
  await redis.set(
    `device:status:${device.id}`,
    JSON.stringify({ status, lastSeen: new Date().toISOString(), error }),
    { EX: 120 }
  );
}

// ─── Estado de sincronización por reloj ─────────────────────────
const deviceState = {};  // { [deviceId]: { lastSync, newRecords } }

// ─── Polling de un reloj ─────────────────────────────────────────
async function pollDevice(device) {
  const lastSync = deviceState[device.id]?.lastSync;
  try {
    logger.info(`🔄 Polling ${device.name} (${device.ip})...`);
    const records = await syncDevice(device, lastSync);

    if (records.length > 0) {
      logger.info(`✅ ${device.name}: ${records.length} marcaje(s) nuevos`);
      deviceState[device.id] = { lastSync: new Date().toISOString(), newRecords: records.length };

      for (const r of records) {
        await publishAttendance({
          employeeCode: String(r.userId),
          timestamp:    new Date(r.timestamp).toISOString(),
          deviceId:     device.id,
          deviceName:   device.name,
          deviceIp:     device.ip,
          type:         mapZKState(r.state),
          raw:          r
        });
      }
    } else {
      logger.info(`${device.name}: sin cambios nuevos`);
      deviceState[device.id] = { ...deviceState[device.id], lastSync: new Date().toISOString() };
    }

    await publishDeviceStatus(device, 'online');
  } catch (err) {
    logger.error(`❌ Error en ${device.name}: ${err.message}`);
    await publishDeviceStatus(device, 'offline', err.message);
  }
}

// ZKTeco punch_state:
//   0 = Check In (entrada)
//   1 = Check Out (salida)
//   2 = Break Out
//   3 = Break In
//   4 = Overtime In
//   5 = Overtime Out
function mapZKState(state) {
  const map = { 0: 'in', 1: 'out', 2: 'break_start', 3: 'break_end', 4: 'in', 5: 'out' };
  return map[state] ?? 'unknown';
}

// ─── API HTTP del Bridge (health + status) ──────────────────────
function startBridgeApi(devices) {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status:    'ok',
      devices:   devices.length,
      timestamp: new Date().toISOString()
    });
  });

  // Estado de los relojes
  app.get('/devices', (req, res) => {
    res.json(devices.map(d => ({
      ...d,
      state: deviceState[d.id] || { status: 'unknown' }
    })));
  });

  // Forzar sync inmediato de un reloj
  app.post('/devices/:id/sync', async (req, res) => {
    const device = devices.find(d => d.id == req.params.id);
    if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
    pollDevice(device).catch(() => {});
    res.json({ message: `Sync iniciado en ${device.name}` });
  });

  // Probar conectividad con un reloj
  app.get('/devices/:id/ping', async (req, res) => {
    const device = devices.find(d => d.id == req.params.id);
    if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
    const result = await connectToDevice(device);
    res.json({ device: device.name, ...result });
  });

  // Obtener usuarios registrados en un reloj
  app.get('/devices/:id/users', async (req, res) => {
    const device = devices.find(d => d.id == req.params.id);
    if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
    const users = await getDeviceUsers(device);
    res.json({ device: device.name, users, total: users.length });
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => logger.info(`🌐 Bridge API en puerto ${PORT}`));
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  await initRedis();

  const devices = getDevices();
  logger.info(`\n${'═'.repeat(50)}`);
  logger.info('🕐 ZKTeco Bridge — Sistema de Asistencia');
  logger.info(`${'═'.repeat(50)}`);
  devices.forEach(d => logger.info(`  📍 ${d.name.padEnd(18)} ${d.ip}:${d.port}`));
  logger.info('');

  // Modo 1: Servidor PUSH (relojes envían datos en tiempo real)
  startPushServer(publishAttendance, logger);

  // Modo 2: Polling periódico por ZKLib
  const intervalMs = parseInt(process.env.ZKTECO_POLL_INTERVAL || '30000');
  logger.info(`🔁 Polling cada ${intervalMs / 1000}s vía ZKLib`);

  // Poll inicial (escalonado para no saturar)
  for (let i = 0; i < devices.length; i++) {
    setTimeout(() => pollDevice(devices[i]), i * 3000);
  }

  // Intervalo de polling
  setInterval(async () => {
    for (const device of devices) {
      await pollDevice(device).catch(() => {});
    }
  }, intervalMs);

  // API del Bridge
  startBridgeApi(devices);
}

main().catch(err => {
  logger.error('Error fatal: ' + err.message);
  process.exit(1);
});
