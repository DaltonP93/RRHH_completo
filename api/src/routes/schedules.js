const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

router.get('/', async (req, res) => {
  const [rows] = await sequelize.query('SELECT * FROM schedules WHERE active = 1 ORDER BY name');
  res.json(rows);
});

router.post('/', authorize('admin','hr'), async (req, res) => {
  const { name, check_in, check_out, tolerance_in = 10, tolerance_out = 10, work_days = '1,2,3,4,5' } = req.body;
  if (!name || !check_in || !check_out) return res.status(400).json({ error: 'Datos incompletos' });
  const [r] = await sequelize.query(
    'INSERT INTO schedules (name, check_in, check_out, tolerance_in, tolerance_out, work_days) VALUES (?, ?, ?, ?, ?, ?)',
    { replacements: [name, check_in, check_out, tolerance_in, tolerance_out, work_days] }
  );
  res.status(201).json({ id: r.insertId });
});

router.put('/:id', authorize('admin','hr'), async (req, res) => {
  const { name, check_in, check_out, tolerance_in, tolerance_out, work_days } = req.body;
  await sequelize.query(
    'UPDATE schedules SET name=COALESCE(?,name), check_in=COALESCE(?,check_in), check_out=COALESCE(?,check_out), tolerance_in=COALESCE(?,tolerance_in), tolerance_out=COALESCE(?,tolerance_out), work_days=COALESCE(?,work_days) WHERE id=?',
    { replacements: [name, check_in, check_out, tolerance_in, tolerance_out, work_days, req.params.id] }
  );
  res.json({ message: 'Horario actualizado' });
});

module.exports = router;
