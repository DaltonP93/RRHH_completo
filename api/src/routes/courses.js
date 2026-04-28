/**
 * courses.js — Capacitaciones / cursos con tracking.
 *
 * GET    /api/courses                       → catálogo de cursos
 * POST   /api/courses                       → crear curso (admin/gth/hr)
 * PUT    /api/courses/:id                   → editar
 * DELETE /api/courses/:id                   → eliminar
 * POST   /api/courses/:id/assign            → asignar a empleados (lista, depto o todos)
 * POST   /api/courses/assignments/:id/complete  → marcar completado
 * GET    /api/courses/:id/progress          → progreso por empleado (admin)
 * GET    /api/courses/my                    → cursos asignados al empleado actual
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// GET /my — cursos del empleado logueado
router.get('/my', async (req, res) => {
  try {
    const [[u]] = await sequelize.query(
      'SELECT employee_id FROM users WHERE id = ?',
      { replacements: [req.user.id] }
    );
    if (!u?.employee_id) return res.json({ ok: true, data: [] });

    const [rows] = await sequelize.query(`
      SELECT
        ca.id AS assignment_id, ca.assigned_at, ca.due_date, ca.completed_at, ca.score,
        ca.certificate_url, ca.notes,
        c.id AS course_id, c.title, c.description, c.category, c.duration_hours,
        c.mandatory, c.valid_until, c.resource_url
      FROM course_assignments ca
      JOIN courses c ON c.id = ca.course_id
      WHERE ca.employee_id = ? AND c.active = 1
      ORDER BY
        CASE WHEN ca.completed_at IS NULL THEN 0 ELSE 1 END,
        ca.due_date IS NULL, ca.due_date,
        c.mandatory DESC
    `, { replacements: [u.employee_id] });
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET / — catálogo
router.get('/', async (_req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        c.*,
        u.full_name AS author_name,
        (SELECT COUNT(*) FROM course_assignments WHERE course_id = c.id) AS total_assigned,
        (SELECT COUNT(*) FROM course_assignments WHERE course_id = c.id AND completed_at IS NOT NULL) AS total_completed
      FROM courses c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.active = 1
      ORDER BY c.mandatory DESC, c.title
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — crear curso
router.post('/',
  authorize('admin', 'gth', 'hr'),
  async (req, res) => {
    const { title, description, category, duration_hours, mandatory, valid_until, resource_url } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title es requerido' });
    try {
      const [r] = await sequelize.query(
        `INSERT INTO courses (title, description, category, duration_hours, mandatory, valid_until, resource_url, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        { replacements: [
          title, description || null, category || null,
          duration_hours || null, mandatory ? 1 : 0,
          valid_until || null, resource_url || null, req.user.id,
        ] }
      );
      res.status(201).json({ ok: true, id: r });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// PUT /:id
router.put('/:id', authorize('admin', 'gth', 'hr'), async (req, res) => {
  const allowed = ['title','description','category','duration_hours','mandatory','valid_until','resource_url','active'];
  const sets = []; const vals = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
  try {
    await sequelize.query(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`,
      { replacements: [...vals, req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id (soft delete via active=0)
router.delete('/:id', authorize('admin', 'gth'), async (req, res) => {
  try {
    await sequelize.query('UPDATE courses SET active = 0 WHERE id = ?', { replacements: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/assign — asignar a empleados / depto / todos
router.post('/:id/assign',
  authorize('admin', 'gth', 'hr'),
  async (req, res) => {
    const courseId = parseInt(req.params.id, 10);
    const { mode = 'employees', employee_ids, department_id, due_date } = req.body || {};
    try {
      let targets = [];
      if (mode === 'employees' && Array.isArray(employee_ids) && employee_ids.length) {
        targets = employee_ids.map(id => parseInt(id, 10)).filter(Boolean);
      } else if (mode === 'department' && department_id) {
        const [rows] = await sequelize.query(
          "SELECT id FROM employees WHERE department_id = ? AND status = 'active'",
          { replacements: [department_id] }
        );
        targets = rows.map(r => r.id);
      } else if (mode === 'all') {
        const [rows] = await sequelize.query("SELECT id FROM employees WHERE status = 'active'");
        targets = rows.map(r => r.id);
      } else {
        return res.status(400).json({ error: 'mode inválido o sin empleados' });
      }

      let inserted = 0, skipped = 0;
      for (const empId of targets) {
        try {
          await sequelize.query(
            `INSERT INTO course_assignments (course_id, employee_id, assigned_by, due_date)
             VALUES (?, ?, ?, ?)`,
            { replacements: [courseId, empId, req.user.id, due_date || null] }
          );
          inserted++;
        } catch (e) {
          // Duplicate key (ya asignado)
          skipped++;
        }
      }
      res.json({ ok: true, inserted, skipped, total_targets: targets.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// POST /assignments/:id/complete
router.post('/assignments/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { score, certificate_url, notes } = req.body || {};
    // Verificar permiso: empleado solo puede completar lo suyo, admin/hr cualquiera
    const [[a]] = await sequelize.query(
      'SELECT employee_id FROM course_assignments WHERE id = ?', { replacements: [id] }
    );
    if (!a) return res.status(404).json({ error: 'Asignación no encontrada' });
    const isAdmin = ['admin', 'gth', 'hr', 'super_admin'].includes(req.user?.role);
    if (!isAdmin) {
      const [[u]] = await sequelize.query('SELECT employee_id FROM users WHERE id = ?', { replacements: [req.user.id] });
      if (u?.employee_id !== a.employee_id) return res.status(403).json({ error: 'Sin permiso' });
    }
    await sequelize.query(`
      UPDATE course_assignments
      SET completed_at = NOW(),
          score = COALESCE(?, score),
          certificate_url = COALESCE(?, certificate_url),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `, { replacements: [score ?? null, certificate_url || null, notes || null, id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/progress — progreso por empleado
router.get('/:id/progress',
  authorize('admin', 'gth', 'hr', 'manager'),
  async (req, res) => {
    try {
      const [rows] = await sequelize.query(`
        SELECT
          ca.id AS assignment_id, ca.assigned_at, ca.due_date, ca.completed_at, ca.score,
          e.id AS employee_id, e.code,
          CONCAT(e.first_name,' ',e.last_name) AS employee_name,
          d.name AS department,
          CASE
            WHEN ca.completed_at IS NOT NULL THEN 'completed'
            WHEN ca.due_date IS NOT NULL AND ca.due_date < CURDATE() THEN 'overdue'
            WHEN ca.due_date IS NOT NULL AND DATEDIFF(ca.due_date, CURDATE()) <= 7 THEN 'due_soon'
            ELSE 'pending'
          END AS status
        FROM course_assignments ca
        JOIN employees e ON e.id = ca.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE ca.course_id = ?
        ORDER BY status, e.last_name
      `, { replacements: [req.params.id] });
      res.json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

module.exports = router;
