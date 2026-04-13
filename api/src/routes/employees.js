const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const {
  getAll, getById, create, update, deactivate, getAttendanceHistory
} = require('../controllers/employeeController');

router.use(authenticate);

// Listado de departamentos activos (para selectores en formularios)
router.get('/departments', async (req, res) => {
  const [rows] = await sequelize.query(
    'SELECT id, name, code FROM departments WHERE active = 1 ORDER BY name'
  );
  res.json(rows);
});

router.get('/',                    getAll);
router.get('/:id',                 getById);
router.post('/',                   authorize('admin','hr'), create);
router.put('/:id',                 authorize('admin','hr'), update);
router.delete('/:id',              authorize('admin'), deactivate);
router.get('/:id/attendance',      getAttendanceHistory);

module.exports = router;
