/**
 * devices.js
 * CRUD de relojes biométricos ZKTeco + operaciones directas.
 */
const router  = require('express').Router();
const net     = require('net');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Ping TCP ─────────────────────────────────────────────────
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

// Helper: conectar ZKLib, ejecutar fn, desconectar
// inPort=0 → OS asigna puerto UDP libre (evita conflicto)
async function withZK(device, fn) {
  const ZKLib = require('node-zklib');
  const zk = new ZKLib(device.ip_address, device.port, 10000, 0);
  try {
    await zk.createSocket();
    const result = await fn(zk);
    await zk.disconnect().catch(() => {});
    return result;
  } catch (err) {
    await zk.disconnect().catch(() => {});
    throw err;
  }
}

// GET /api/devices
router.get('/', authorize('admin','gestor','hr'), async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM devices ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/devices/ping-all
router.get('/ping-all', authorize('admin','gestor','hr'), async (req, res) => {
  try {
    let [devices] = await sequelize.query('SELECT * FROM devices');
    if (!devices.length) {
      const DEFAULTS = [
        { name: 'Reloj Comedor',  ip_address: '172.16.20.160', port: 4370, location: 'Comedor' },
        { name: 'Reloj Lavadero', ip_address: '172.16.20.161', port: 4370, location: 'Lavadero' },
        { name: 'Reloj Gerencia', ip_address: '172.16.20.162', port: 4370, location: 'Gerencia' },
      ];
      for (const d of DEFAULTS) {
        await sequelize.query(
          'INSERT IGNORE INTO devices (name, ip_address, port, location) VALUES (?,?,?,?)',
          { replacements: [d.name, d.ip_address, d.port, d.location] }
        ).catch(() => {});
      }
      [devices] = await sequelize.query('SELECT * FROM devices');
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/devices
router.post('/', authorize('admin','gestor'), async (req, res) => {
  try {
    const { name, ip_address, port = 4370, location, serial_no } = req.body;
    if (!name || !ip_address) return res.status(400).json({ error: 'Nombre e IP son requeridos' });
    const [result] = await sequelize.query(
      'INSERT INTO devices (name, ip_address, port, location, serial_no) VALUES (?,?,?,?,?)',
      { replacements: [name, ip_address, port, location || null, serial_no || null] }
    );
    res.status(201).json({ id: result.insertId, message: 'Reloj agregado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/devices/:id
router.put('/:id', authorize('admin','gestor'), async (req, res) => {
  try {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/devices/:id
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    await sequelize.query('DELETE FROM devices WHERE id=?', { replacements: [req.params.id] });
    res.json({ message: 'Reloj eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/devices/:id/info — info completa del reloj vía ZKLib
router.get('/:id/info', authorize('admin','gestor','hr'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });

  try {
    const result = await withZK(device, async zk => {
      const info = {};

      // ── 1. Campos básicos via getInfo() ──────────────────────
      try {
        const basic = await zk.getInfo();
        Object.assign(info, basic);
      } catch {}

      // ── 2. Parsear más campos del buffer CMD_GET_FREE_SIZES ───
      // executeCmd está disponible en instancias JS aunque no documentado
      try {
        const buf = await zk.executeCmd(50, ''); // 50 = CMD_GET_FREE_SIZES
        const safe = (offset) => {
          try { return buf.length > offset + 3 ? buf.readUIntLE(offset, 4) : undefined; } catch { return undefined; }
        };
        // Offsets confirmados: 24=userCounts, 40=logCounts, 72=logCapacity
        // Adicionales según protocolo ZKTeco:
        const fpCount      = safe(28);
        const pwdCount     = safe(32);
        const superLogCount= safe(44);
        const adminCount   = safe(48);
        const faceCount    = safe(52);
        const userCapacity = safe(56);
        const fpCapacity   = safe(64);

        if (fpCount      !== undefined) info.fpCount      = fpCount;
        if (pwdCount     !== undefined) info.pwdCount     = pwdCount;
        if (superLogCount!== undefined) info.superLogCount= superLogCount;
        if (adminCount   !== undefined) info.adminCount   = adminCount;
        if (faceCount    !== undefined) info.faceCount    = faceCount;
        if (userCapacity !== undefined) info.userCapacity = userCapacity;
        if (fpCapacity   !== undefined) info.fpCapacity   = fpCapacity;
      } catch {}

      // ── 3. Metadata via CMD_OPTIONS_RRQ (11) ─────────────────
      const metaKeys = [
        ['ProductName',      'productName'],
        ['FirmVer',          'firmwareVersion'],
        ['SerialNumber',     'serialNumber'],
        ['Platform',         'platform'],
        ['~ZKFPVersion',     'fpVersion'],
        ['ManufactureTime',  'manufactureTime'],
      ];
      for (const [key, field] of metaKeys) {
        try {
          const buf = await zk.executeCmd(11, key); // 11 = CMD_OPTIONS_RRQ
          // Respuesta: 8 bytes header + string valor
          const val = buf.slice(8).toString('ascii').replace(/\0/g, '').trim();
          if (val) info[field] = val;
        } catch {}
      }

      return info;
    });

    res.json({ ok: true, device: device.name, ip: device.ip_address, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// GET /api/devices/:id/users
router.get('/:id/users', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    const users = await withZK(device, async zk => {
      const { data } = await zk.getUsers();
      return data;
    });
    res.json({ device: device.name, users, total: users.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/devices/:id/backup
router.post('/:id/backup', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    const logs = await withZK(device, async zk => {
      const { data } = await zk.getAttendances();
      return data;
    });

    let imported = 0, skipped = 0;
    for (const log of logs) {
      const checkTime = new Date(log.attTime);
      const type = log.inOutStatus === 0 ? 'in' : 'out';
      const [[emp]] = await sequelize.query(
        'SELECT id FROM employees WHERE code=? AND status="active"',
        { replacements: [String(log.deviceUserId)] }
      );
      if (!emp) { skipped++; continue; }
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
    await sequelize.query('UPDATE devices SET last_sync=NOW() WHERE id=?', { replacements: [device.id] });
    res.json({ ok: true, total: logs.length, imported, skipped });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/devices/:id/clear
router.post('/:id/clear', authorize('admin'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    await withZK(device, zk => zk.clearAttendanceLog());
    res.json({ ok: true, message: `Registros eliminados del reloj ${device.name}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/devices/:id/disable
router.post('/:id/disable', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    await withZK(device, zk => zk.disableDevice());
    res.json({ ok: true, message: `Reloj ${device.name} deshabilitado` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/devices/:id/enable
router.post('/:id/enable', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    await withZK(device, zk => zk.enableDevice());
    res.json({ ok: true, message: `Reloj ${device.name} habilitado` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
