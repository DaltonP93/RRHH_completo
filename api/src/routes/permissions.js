const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

router.get('/', async (req, res) => {
  const { status, employeeId, department_id } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status)        { where += ' AND p.status = ?';           params.push(status); }
  if (employeeId)    { where += ' AND p.employee_id = ?';      params.push(employeeId); }
  if (department_id) { where += ' AND e.department_id = ?';    params.push(department_id); }

  const [rows] = await sequelize.query(`
    SELECT p.*,
      CONCAT(e.first_name,' ',e.last_name) AS employee_name,
      d.name AS department,
      e.department_id
    FROM permissions p
    JOIN employees e ON p.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 200
  `, { replacements: params });

  res.json(rows);
});

router.post('/', async (req, res) => {
  const { employee_id, type, date_from, date_to, reason } = req.body;
  if (!employee_id || !type || !date_from || !date_to) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  const [r] = await sequelize.query(
    'INSERT INTO permissions (employee_id, type, date_from, date_to, reason) VALUES (?, ?, ?, ?, ?)',
    { replacements: [employee_id, type, date_from, date_to, reason] }
  );
  res.status(201).json({ id: r.insertId, message: 'Permiso solicitado' });
});

// Acepta PUT y PATCH para compatibilidad con el frontend
router.put('/:id/approve',   authorize('admin','hr'), approveHandler);
router.patch('/:id/approve', authorize('admin','hr'), approveHandler);
router.put('/:id/reject',    authorize('admin','hr'), rejectHandler);
router.patch('/:id/reject',  authorize('admin','hr'), rejectHandler);

async function approveHandler(req, res) {
  await sequelize.query(
    'UPDATE permissions SET status="approved", approved_by=?, approved_at=NOW() WHERE id=?',
    { replacements: [req.user.id, req.params.id] }
  );
  res.json({ message: 'Permiso aprobado' });
}

async function rejectHandler(req, res) {
  const { rejection_reason, reason } = req.body;
  await sequelize.query(
    'UPDATE permissions SET status="rejected", approved_by=?, approved_at=NOW(), rejection_reason=? WHERE id=?',
    { replacements: [req.user.id, rejection_reason || reason || null, req.params.id] }
  );
  res.json({ message: 'Permiso rechazado' });
}

module.exports = router;
