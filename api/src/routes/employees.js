const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
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

router.get('/',                    requirePermission('empleados', 'view'), getAll);
router.get('/:id',                 requirePermission('empleados', 'view'), getById);
router.post('/',                   authorize('admin','hr'), requirePermission('empleados', 'create'), create);
router.put('/:id',                 authorize('admin','hr'), requirePermission('empleados', 'update'), update);
router.delete('/:id',              authorize('admin'), requirePermission('empleados', 'delete'), deactivate);
router.get('/:id/attendance',      requirePermission('empleados', 'view'), getAttendanceHistory);

// Helper: normalizar fecha de hire_date aceptando "DD/MM/YYYY", "YYYY-MM-DD", etc.
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? '20' + y : y;
    return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

function parseStatus(v) {
  if (!v) return 'active';
  const s = String(v).toLowerCase().trim();
  if (['inactive', 'inactivo', 'baja', 'disabled', '0', 'no', 'false'].includes(s)) return 'inactive';
  if (['suspended', 'suspendido', 'suspenso'].includes(s)) return 'suspended';
  return 'active';
}

// POST /api/employees/import — importar lote de empleados (CSV/Excel)
router.post('/import', authorize('admin','hr'), requirePermission('empleados', 'create'), async (req, res) => {
  const { employees } = req.body;
  if (!Array.isArray(employees) || !employees.length) {
    return res.status(400).json({ error: 'Se requiere un array de empleados' });
  }

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  for (const emp of employees) {
    const code       = String(emp.code || '').trim();
    const firstName  = String(emp.first_name || emp.nombre || emp.Nombre || '').trim();
    const lastName   = String(emp.last_name  || emp.apellido || emp.Apellido || '').trim();
    const empNumber  = String(emp.employee_number || emp.legajo || emp.cedula || emp.document_id || '').trim() || null;
    const hireDate   = parseDate(emp.hire_date || emp.fecha_ingreso || emp.hiredate);
    const status     = parseStatus(emp.status || emp.estado);
    const email      = String(emp.email || '').trim() || null;
    const phone      = String(emp.phone || emp.telefono || '').trim() || null;
    const position   = String(emp.position || emp.cargo || '').trim() || null;

    if (!code || !firstName) {
      errors.push({ code: code || '?', error: 'Código y nombre son requeridos' });
      continue;
    }

    try {
      // Resolver department_id desde nombre de departamento si no viene el ID
      let deptId = emp.department_id || null;
      if (!deptId && (emp.department || emp.departamento)) {
        const deptName = String(emp.department || emp.departamento).trim();
        const [[dept]] = await sequelize.query(
          'SELECT id FROM departments WHERE name=? OR code=? LIMIT 1',
          { replacements: [deptName, deptName] }
        );
        if (dept) {
          deptId = dept.id;
        } else if (deptName) {
          // Auto-crear el departamento si no existe (facilita imports desde HR externo)
          const [ins] = await sequelize.query(
            'INSERT INTO departments (name, active) VALUES (?, 1)',
            { replacements: [deptName] }
          );
          deptId = ins; // insertId
        }
      }

      const [[existing]] = await sequelize.query(
        'SELECT id FROM employees WHERE code=?', { replacements: [code] }
      );

      if (existing) {
        if (emp._update) {
          await sequelize.query(`
            UPDATE employees SET
              first_name      = COALESCE(NULLIF(?,''), first_name),
              last_name       = COALESCE(NULLIF(?,''), last_name),
              employee_number = COALESCE(NULLIF(?,''), employee_number),
              email           = COALESCE(NULLIF(?,''), email),
              phone           = COALESCE(NULLIF(?,''), phone),
              position        = COALESCE(NULLIF(?,''), position),
              department_id   = COALESCE(?, department_id),
              hire_date       = COALESCE(?, hire_date),
              status          = COALESCE(NULLIF(?,''), status)
            WHERE code = ?`,
            { replacements: [firstName, lastName, empNumber, email, phone, position, deptId, hireDate, status, code] }
          );
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      await sequelize.query(`
        INSERT INTO employees
          (code, employee_number, first_name, last_name, email, phone, position, department_id, hire_date, status)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        { replacements: [code, empNumber, firstName, lastName, email, phone, position, deptId, hireDate, status] }
      );
      created++;
    } catch (e) {
      errors.push({ code, error: e.message });
    }
  }

  res.json({ ok: true, created, updated, skipped, errors, total: employees.length });
});

// PATCH /api/employees/bulk — actualizar varios empleados a la vez
// Body: { ids: [1,2,3], changes: { department_id, status, position, schedule_id } }
router.patch('/bulk', authorize('admin','hr'), requirePermission('empleados', 'update'), async (req, res) => {
  const { ids, changes } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids requerido (array)' });
  }
  if (!changes || typeof changes !== 'object') {
    return res.status(400).json({ error: 'changes requerido' });
  }
  const allowed = ['department_id', 'schedule_id', 'status', 'position'];
  const sets = [];
  const vals = [];
  for (const f of allowed) {
    if (changes[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(changes[f] === '' ? null : changes[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Ningún campo válido en changes' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await sequelize.query(
      `UPDATE employees SET ${sets.join(', ')} WHERE id IN (${placeholders})`,
      { replacements: [...vals, ...ids] }
    );
    res.json({ ok: true, affected: result?.affectedRows ?? ids.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/employees/:id/quick — edición inline rápida (nombre, apellido, etc.)
// Map explícito: la clave recibida del cliente nunca toca el SQL directamente.
const QUICK_EDIT_COLS = {
  first_name: 'first_name', last_name: 'last_name',
  employee_number: 'employee_number', email: 'email',
  phone: 'phone', position: 'position',
  birth_date: 'birth_date', hire_date: 'hire_date',
};
router.patch('/:id/quick', authorize('admin','hr'), requirePermission('empleados', 'update'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { field, value } = req.body || {};
  const col = QUICK_EDIT_COLS[field];
  if (!col) return res.status(400).json({ error: 'Campo no permitido para edición rápida' });
  try {
    await sequelize.query(
      `UPDATE employees SET \`${col}\` = ? WHERE id = ?`,
      { replacements: [value === '' ? null : value, id] }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Preaviso e Indemnización (Código Laboral Paraguay) ──────────

// POST /api/employees/:id/termination-preview
// Calcula preaviso e indemnización sin persistir (dry-run)
// Body: { termination_date, termination_type, days_since_last_payment }
router.post('/:id/termination-preview', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { calculateTermination } = require('../services/terminationCalculator');

    const [[emp]] = await sequelize.query(`
      SELECT e.*, pp.base_salary FROM employees e
      LEFT JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status = 'active'
      WHERE e.id = ?
    `, { replacements: [req.params.id] });

    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const {
      termination_date = new Date().toISOString().slice(0, 10),
      termination_type = 'sin_causa',
      days_since_last_payment = 0,
    } = req.body;

    const baseSalary = parseFloat(emp.base_salary || emp.salary_base || 0);
    if (baseSalary === 0) return res.status(400).json({ error: 'El empleado no tiene salario base configurado' });

    const result = calculateTermination({
      hireDate: emp.hire_date,
      terminationDate: termination_date,
      baseSalary,
      terminationType: termination_type,
      daysSinceLastSalaryPayment: parseInt(days_since_last_payment) || 0,
    });

    res.json({
      employee: { id: emp.id, name: `${emp.first_name} ${emp.last_name}`, code: emp.code },
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:id/terminate — registrar baja y generar liquidación
router.post('/:id/terminate', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { calculateTermination } = require('../services/terminationCalculator');

    const [[emp]] = await sequelize.query(`
      SELECT e.*, pp.base_salary FROM employees e
      LEFT JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status = 'active'
      WHERE e.id = ?
    `, { replacements: [req.params.id] });

    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });
    if (emp.status === 'inactive') return res.status(400).json({ error: 'El empleado ya está inactivo' });

    const {
      termination_date = new Date().toISOString().slice(0, 10),
      termination_type = 'sin_causa',
      termination_reason = '',
      days_since_last_payment = 0,
    } = req.body;

    const baseSalary = parseFloat(emp.base_salary || emp.salary_base || 0);
    const calc = calculateTermination({
      hireDate: emp.hire_date,
      terminationDate: termination_date,
      baseSalary,
      terminationType: termination_type,
      daysSinceLastSalaryPayment: parseInt(days_since_last_payment) || 0,
    });

    // Inactivar empleado
    await sequelize.query(`
      UPDATE employees SET status = 'inactive', termination_date = ?,
        termination_type = ?, termination_reason = ?, updated_at = NOW()
      WHERE id = ?
    `, { replacements: [termination_date, termination_type, termination_reason || null, emp.id] });

    // Desactivar perfil de nómina
    await sequelize.query(
      "UPDATE payroll_profiles SET status = 'inactive', valid_to = ? WHERE employee_id = ? AND status = 'active'",
      { replacements: [termination_date, emp.id] }
    );

    res.json({
      message: 'Empleado dado de baja correctamente',
      employee_id: emp.id,
      termination_date,
      termination_type,
      liquidation: calc,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
