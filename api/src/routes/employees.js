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

// POST /api/employees/import — importar lote de empleados (CSV/Excel)
router.post('/import', authorize('admin','hr'), async (req, res) => {
  const { employees } = req.body;
  if (!Array.isArray(employees) || !employees.length) {
    return res.status(400).json({ error: 'Se requiere un array de empleados' });
  }

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  for (const emp of employees) {
    const code      = String(emp.code || '').trim();
    const firstName = String(emp.first_name || emp.nombre || emp.Nombre || '').trim();
    const lastName  = String(emp.last_name  || emp.apellido || emp.Apellido || '').trim();

    if (!code || !firstName) {
      errors.push({ code: code || '?', error: 'Código y nombre son requeridos' });
      continue;
    }

    try {
      // Resolver department_id desde nombre de departamento si no viene el ID
      let deptId = emp.department_id || null;
      if (!deptId && (emp.department || emp.departamento)) {
        const deptName = emp.department || emp.departamento;
        const [[dept]] = await sequelize.query(
          'SELECT id FROM departments WHERE name=? OR code=? LIMIT 1',
          { replacements: [deptName, deptName] }
        );
        deptId = dept?.id || null;
      }

      const [[existing]] = await sequelize.query(
        'SELECT id FROM employees WHERE code=?', { replacements: [code] }
      );

      if (existing) {
        // Actualizar solo si el campo _update=true
        if (emp._update) {
          await sequelize.query(
            'UPDATE employees SET first_name=COALESCE(NULLIF(?,\'\'),first_name), last_name=COALESCE(NULLIF(?,\'\'),last_name), email=COALESCE(NULLIF(?,\'\'),email), phone=COALESCE(NULLIF(?,\'\'),phone), position=COALESCE(NULLIF(?,\'\'),position), department_id=COALESCE(?,department_id) WHERE code=?',
            { replacements: [firstName, lastName, emp.email||null, emp.phone||null, emp.position||emp.cargo||null, deptId, code] }
          );
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      await sequelize.query(
        'INSERT INTO employees (code, first_name, last_name, email, phone, position, department_id, status) VALUES (?,?,?,?,?,?,?,\'active\')',
        { replacements: [
          code, firstName, lastName,
          emp.email    || null,
          emp.phone    || emp.telefono || null,
          emp.position || emp.cargo    || null,
          deptId,
        ]}
      );
      created++;
    } catch (e) {
      errors.push({ code, error: e.message });
    }
  }

  res.json({ ok: true, created, updated, skipped, errors, total: employees.length });
});

module.exports = router;
