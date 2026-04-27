/**
 * employeeNotes.js — Notas internas por empleado (timeline RRHH).
 *
 * GET    /api/employee-notes/by-employee/:id
 * POST   /api/employee-notes                    (admin/gth/hr)
 * PUT    /api/employee-notes/:id                (autor o admin)
 * DELETE /api/employee-notes/:id                (admin/gth/hr)
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

const VALID_TYPES      = new Set(['observation','warning','recognition','medical','training','other']);
const VALID_VISIBILITY = new Set(['hr_only','managers','employee']);

// Listado por empleado
router.get('/by-employee/:id', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    const role = req.user?.role;
    let visibilityFilter = '';
    if (role === 'employee') {
      visibilityFilter = " AND n.visibility = 'employee'";
    } else if (['supervisor','coordinator','manager','gestor'].includes(role)) {
      visibilityFilter = " AND n.visibility IN ('managers','employee')";
    }

    const [rows] = await sequelize.query(`
      SELECT n.*, u.username AS author_username, u.full_name AS author_name
      FROM employee_notes n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.employee_id = ? ${visibilityFilter}
      ORDER BY n.pinned DESC, n.created_at DESC
    `, { replacements: [empId] });
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear nota
router.post('/',
  authorize('admin', 'gth', 'hr', 'manager'),
  requirePermission('empleados', 'update'),
  async (req, res) => {
    const {
      employee_id, type = 'observation', visibility = 'hr_only',
      title, body, pinned = 0, attachment_url,
    } = req.body || {};
    if (!employee_id || !title) {
      return res.status(400).json({ error: 'employee_id y title son requeridos' });
    }
    if (!VALID_TYPES.has(type))      return res.status(400).json({ error: 'type inválido' });
    if (!VALID_VISIBILITY.has(visibility)) return res.status(400).json({ error: 'visibility inválido' });
    try {
      const [r] = await sequelize.query(
        `INSERT INTO employee_notes (employee_id, author_id, type, visibility, title, body, pinned, attachment_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        { replacements: [employee_id, req.user.id, type, visibility, title, body || null, pinned ? 1 : 0, attachment_url || null] }
      );
      res.status(201).json({ ok: true, id: r });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// Editar (autor o admin)
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[note]] = await sequelize.query(
      'SELECT author_id FROM employee_notes WHERE id = ?', { replacements: [id] }
    );
    if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
    const isAdmin = ['admin', 'gth', 'super_admin'].includes(req.user?.role);
    if (!isAdmin && note.author_id !== req.user?.id) {
      return res.status(403).json({ error: 'Solo el autor o admin pueden editar' });
    }

    const allowed = ['type','visibility','title','body','pinned','attachment_url'];
    const sets = []; const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (k === 'type' && !VALID_TYPES.has(req.body[k])) {
          return res.status(400).json({ error: 'type inválido' });
        }
        if (k === 'visibility' && !VALID_VISIBILITY.has(req.body[k])) {
          return res.status(400).json({ error: 'visibility inválido' });
        }
        sets.push(`${k} = ?`); vals.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
    await sequelize.query(`UPDATE employee_notes SET ${sets.join(', ')} WHERE id = ?`,
      { replacements: [...vals, id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar
router.delete('/:id',
  authorize('admin', 'gth', 'hr'),
  async (req, res) => {
    try {
      await sequelize.query('DELETE FROM employee_notes WHERE id = ?', { replacements: [req.params.id] });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

module.exports = router;
