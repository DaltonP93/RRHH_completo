const router  = require('express').Router();
const net     = require('net');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate, authorize('admin','hr'));

// ─── Ping TCP a un reloj ──────────────────────────────────────
function pingDevice(ip, port, timeout = 3000) {
  return new Promise(resolve => {
    const start  = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ status: 'online', latency });
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ status: 'offline', latency: null }); });
    socket.on('error',   () => { socket.destroy(); resolve({ status: 'offline', latency: null }); });
    socket.connect(port, ip);
  });
}

// GET /api/devices/ping-all — Verificar conectividad TCP de todos los relojes
router.get('/ping-all', async (req, res) => {
  const DEVICES = [
    { id: 101, name: 'Reloj Comedor',  ip_address: '172.16.20.160', port: 4370 },
    { id: 103, name: 'Reloj Lavadero', ip_address: '172.16.20.161', port: 4370 },
    { id: 1,   name: 'Reloj Gerencia', ip_address: '172.16.20.162', port: 4370 },
  ];
  const results = await Promise.all(
    DEVICES.map(async d => {
      const { status, latency } = await pingDevice(d.ip_address, d.port);
      // Actualizar estado en BD si existe el registro
      await sequelize.query(
        'UPDATE devices SET status=?, last_sync=NOW() WHERE id=? OR ip_address=?',
        { replacements: [status, d.id, d.ip_address] }
      ).catch(() => {});
      return { ...d, status, latency };
    })
  );
  res.json(results);
});

// GET /api/devices
router.get('/', async (req, res) => {
  const [rows] = await sequelize.query('SELECT * FROM devices ORDER BY name');
  res.json(rows);
});

// POST /api/devices
router.post('/', async (req, res) => {
  const { name, ip_address, port = 4370, location } = req.body;
  if (!name || !ip_address) return res.status(400).json({ error: 'Nombre e IP son requeridos' });
  const [result] = await sequelize.query(
    'INSERT INTO devices (name, ip_address, port, location) VALUES (?, ?, ?, ?)',
    { replacements: [name, ip_address, port, location] }
  );
  res.status(201).json({ id: result.insertId });
});

// PUT /api/devices/:id
router.put('/:id', async (req, res) => {
  const { name, ip_address, port, location } = req.body;
  await sequelize.query(
    'UPDATE devices SET name=COALESCE(?,name), ip_address=COALESCE(?,ip_address), port=COALESCE(?,port), location=COALESCE(?,location) WHERE id=?',
    { replacements: [name, ip_address, port, location, req.params.id] }
  );
  res.json({ message: 'Reloj actualizado' });
});

// DELETE /api/devices/:id
router.delete('/:id', authorize('admin'), async (req, res) => {
  await sequelize.query('DELETE FROM devices WHERE id = ?', { replacements: [req.params.id] });
  res.json({ message: 'Reloj eliminado' });
});

module.exports = router;
