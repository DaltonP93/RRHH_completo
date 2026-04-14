/**
 * devices.js
 * CRUD de relojes biométricos ZKTeco + operaciones directas:
 *   - Ping TCP
 *   - Backup de marcajes del reloj → BD
 *   - Borrar registros del reloj (liberar memoria)
 *   - Listar usuarios registrados en el reloj
 */
const router  = require('express').Router();
const net     = require('net');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Ping TCP a un reloj ──────────────────────────────────────
function pingDevice(ip, port, timeout = 3000) {
  return new Promise(resolve => {
    const start  = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve({ status: 'online',  latency: Date.now() - start }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ status: 'offline', latency: null }); });
    socket.on('error',   () => { socket.destroy(); resolve({ status: 'offline', latency: null }); });
    socket.connect(port, ip);
  });
}

// GET /api/devices — listar relojes
router.get('/', authorize('admin','gestor','hr'), async (req, res) => {
  const [rows] = await sequelize.query('SELECT * FROM devices ORDER BY name');
  res.json(rows);
});

// GET /api/devices/ping-all — verificar conectividad de todos
router.get('/ping-all', authorize('admin','gestor','hr'), async (req, res) => {
  const [devices] = await sequelize.query('SELECT * FROM devices');
  if (!devices.length) {
    // Fallback a relojes estáticos
    const STATIC = [
      { id: 101, name: 'Reloj Comedor',  ip_address: '172.16.20.160', port: 4370 },
      { id: 103, name: 'Reloj Lavadero', ip_address: '172.16.20.161', port: 4370 },
      { id: 1,   name: 'Reloj Gerencia', ip_address: '172.16.20.162', port: 4370 },
    ];
    const results = await Promise.all(STATIC.map(async d => ({
      ...d, ...(await pingDevice(d.ip_address, d.port))
    })));
    return res.json(results);
  }
  const results = await Promise.all(devices.map(async d => {
    const { status, latency } = await pingDevice(d.ip_address, d.port);
    await sequelize.query(
      'UPDATE devices SET status=?, last_sync=NOW() WHERE id=?',
      { replacements: [status, d.id] }
    ).catch(() => {});
    return { ...d, status, latency };
  }));
  res.json(results);
});

// POST /api/devices — agregar reloj
router.post('/', authorize('admin','gestor'), async (req, res) => {
  const { name, ip_address, port = 4370, location, serial_no } = req.body;
  if (!name || !ip_address) return res.status(400).json({ error: 'Nombre e IP son requeridos' });
  const [result] = await sequelize.query(
    'INSERT INTO devices (name, ip_address, port, location, serial_no) VALUES (?, ?, ?, ?, ?)',
    { replacements: [name, ip_address, port, location || null, serial_no || null] }
  );
  res.status(201).json({ id: result.insertId, message: 'Reloj agregado' });
});

// PUT /api/devices/:id — editar reloj
router.put('/:id', authorize('admin','gestor'), async (req, res) => {
  const { name, ip_address, port, location, serial_no } = req.body;
  await sequelize.query(
    `UPDATE devices SET
      name=COALESCE(?,name), ip_address=COALESCE(?,ip_address),
      port=COALESCE(?,port), location=COALESCE(?,location),
      serial_no=COALESCE(?,serial_no)
     WHERE id=?`,
    { replacements: [name, ip_address, port, location, serial_no, req.params.id] }
  );
  res.json({ message: 'Reloj actualizado' });
});

// DELETE /api/devices/:id — eliminar reloj
router.delete('/:id', authorize('admin'), async (req, res) => {
  await sequelize.query('DELETE FROM devices WHERE id = ?', { replacements: [req.params.id] });
  res.json({ message: 'Reloj eliminado' });
});

// POST /api/devices/:id/backup — leer marcajes del reloj y guardar en BD
router.post('/:id/backup', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query(
    'SELECT * FROM devices WHERE id = ?', { replacements: [req.params.id] }
  );
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });

  try {
    const ZKLib = require('node-zklib');
    const zk = new ZKLib(device.ip_address, device.port, 10000, 4000);
    await zk.createSocket();
    const { data: logs } = await zk.getAttendances();
    await zk.disconnect();

    let imported = 0, skipped = 0;

    for (const log of logs) {
      // log: { deviceUserId, attTime, verifyType, inOutStatus }
      const checkTime = new Date(log.attTime);
      const type = log.inOutStatus === 0 ? 'in' : 'out';

      // Buscar empleado por code (ZKTeco deviceUserId)
      const [[emp]] = await sequelize.query(
        'SELECT id FROM employees WHERE code = ? AND status = "active"',
        { replacements: [String(log.deviceUserId)] }
      );
      if (!emp) { skipped++; continue; }

      // Insertar si no existe
      const [[existing]] = await sequelize.query(
        'SELECT id FROM attendance_logs WHERE employee_id=? AND `timestamp`=? AND source="device"',
        { replacements: [emp.id, checkTime] }
      );
      if (existing) { skipped++; continue; }

      await sequelize.query(
        'INSERT INTO attendance_logs (employee_id, device_id, `timestamp`, type, source) VALUES (?,?,?,?,?)',
        { replacements: [emp.id, device.id, checkTime, type, 'device'] }
      );
      imported++;
    }

    // Actualizar last_sync del reloj
    await sequelize.query('UPDATE devices SET last_sync=NOW() WHERE id=?', { replacements: [device.id] });

    res.json({ ok: true, total: logs.length, imported, skipped });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/devices/:id/clear — borrar marcajes del reloj (liberar memoria)
router.post('/:id/clear', authorize('admin'), async (req, res) => {
  const [[device]] = await sequelize.query(
    'SELECT * FROM devices WHERE id = ?', { replacements: [req.params.id] }
  );
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });

  try {
    const ZKLib = require('node-zklib');
    const zk = new ZKLib(device.ip_address, device.port, 10000, 4000);
    await zk.createSocket();
    await zk.clearAttendanceLog();
    await zk.disconnect();

    res.json({ ok: true, message: `Registros eliminados del reloj ${device.name}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/devices/:id/users — listar usuarios registrados en el reloj
router.get('/:id/users', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query(
    'SELECT * FROM devices WHERE id = ?', { replacements: [req.params.id] }
  );
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });

  try {
    const ZKLib = require('node-zklib');
    const zk = new ZKLib(device.ip_address, device.port, 10000, 4000);
    await zk.createSocket();
    const { data: users } = await zk.getUsers();
    await zk.disconnect();
    res.json({ device: device.name, users, total: users.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/devices/:id/logs-count — cuántos registros tiene el reloj
router.get('/:id/logs-count', authorize('admin','gestor','hr'), async (req, res) => {
  const [[device]] = await sequelize.query(
    'SELECT * FROM devices WHERE id = ?', { replacements: [req.params.id] }
  );
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });

  try {
    const ZKLib = require('node-zklib');
    const zk = new ZKLib(device.ip_address, device.port, 10000, 4000);
    await zk.createSocket();
    const info = await zk.getInfo();
    await zk.disconnect();
    res.json({ device: device.name, ...info });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
