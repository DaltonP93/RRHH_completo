const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate, authorize('admin','hr'));

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
