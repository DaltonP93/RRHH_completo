/**
 * announcements.js — Comunicados internos broadcast con confirmación de lectura.
 *
 * GET    /api/announcements           → listado visible para el usuario actual
 * GET    /api/announcements/unread    → conteo de no leídos para banner
 * GET    /api/announcements/:id       → detalle + lista de quienes leyeron
 * POST   /api/announcements           → crear (admin/gth/hr/manager)
 * POST   /api/announcements/:id/read  → marcar como leído
 * PUT    /api/announcements/:id       → editar (autor o admin)
 * DELETE /api/announcements/:id       → eliminar (admin/autor)
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// Helper: obtiene el employee_id (y department_id) del usuario actual si está vinculado a un empleado
async function getViewerContext(userId) {
  const [[u]] = await sequelize.query(`
    SELECT u.id AS user_id, u.role, u.employee_id, e.department_id
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    WHERE u.id = ?
  `, { replacements: [userId] });
  return u;
}

// Construye WHERE para que el usuario solo vea los anuncios que le corresponden
function buildAudienceFilter(viewer) {
  const conditions = [];
  const params = [];
  conditions.push("a.audience = 'all'");
  if (viewer?.department_id) {
    conditions.push("(a.audience = 'department' AND a.audience_dept = ?)");
    params.push(viewer.department_id);
  }
  if (viewer?.role) {
    conditions.push("(a.audience = 'role' AND a.audience_role = ?)");
    params.push(viewer.role);
  }
  if (viewer?.employee_id) {
    // JSON_CONTAINS busca el id en la lista
    conditions.push("(a.audience = 'employees' AND JSON_CONTAINS(a.audience_emps, ?))");
    params.push(JSON.stringify(viewer.employee_id));
  }
  return { sql: `(${conditions.join(' OR ')})`, params };
}

// GET / — listado visible
router.get('/', async (req, res) => {
  try {
    const viewer = await getViewerContext(req.user.id);
    const aud = buildAudienceFilter(viewer);

    const [rows] = await sequelize.query(`
      SELECT
        a.id, a.title, a.body, a.audience, a.audience_dept, a.audience_role,
        a.priority, a.require_ack, a.pinned, a.expires_at, a.created_at,
        u.full_name AS author_name, u.username AS author_username,
        d.name AS audience_dept_name,
        (SELECT read_at FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = ?) AS read_at
      FROM announcements a
      JOIN users u ON u.id = a.created_by
      LEFT JOIN departments d ON d.id = a.audience_dept
      WHERE ${aud.sql}
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
      ORDER BY a.pinned DESC, a.priority = 'critical' DESC, a.priority = 'important' DESC, a.created_at DESC
    `, { replacements: [req.user.id, ...aud.params] });

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /unread — conteo de no leídos (para badge)
router.get('/unread', async (req, res) => {
  try {
    const viewer = await getViewerContext(req.user.id);
    const aud = buildAudienceFilter(viewer);

    const [[r]] = await sequelize.query(`
      SELECT COUNT(*) AS unread
      FROM announcements a
      WHERE ${aud.sql}
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND NOT EXISTS (
          SELECT 1 FROM announcement_reads ar
          WHERE ar.announcement_id = a.id AND ar.user_id = ?
        )
    `, { replacements: [...aud.params, req.user.id] });

    res.json({ ok: true, unread: Number(r?.unread) || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — detalle + recipients (quien leyó)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[a]] = await sequelize.query(`
      SELECT a.*, u.full_name AS author_name
      FROM announcements a
      JOIN users u ON u.id = a.created_by
      WHERE a.id = ?
    `, { replacements: [id] });
    if (!a) return res.status(404).json({ error: 'No encontrado' });

    const [reads] = await sequelize.query(`
      SELECT u.id, u.username, u.full_name, ar.read_at
      FROM announcement_reads ar
      JOIN users u ON u.id = ar.user_id
      WHERE ar.announcement_id = ?
      ORDER BY ar.read_at DESC
    `, { replacements: [id] });

    res.json({ ok: true, data: a, reads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — crear
router.post('/',
  authorize('admin', 'gth', 'hr', 'manager', 'super_admin'),
  async (req, res) => {
    const {
      title, body,
      audience = 'all', audience_dept, audience_role, audience_emps,
      priority = 'info', require_ack = 0, pinned = 0, expires_at,
    } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'title y body son requeridos' });
    if (!['all','department','role','employees'].includes(audience)) {
      return res.status(400).json({ error: 'audience inválido' });
    }
    try {
      const [r] = await sequelize.query(
        `INSERT INTO announcements
           (title, body, audience, audience_dept, audience_role, audience_emps, priority, require_ack, pinned, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        { replacements: [
          title, body, audience,
          audience === 'department' ? audience_dept : null,
          audience === 'role' ? audience_role : null,
          audience === 'employees' && Array.isArray(audience_emps) ? JSON.stringify(audience_emps) : null,
          priority, require_ack ? 1 : 0, pinned ? 1 : 0,
          expires_at || null, req.user.id,
        ] }
      );
      res.status(201).json({ ok: true, id: r });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// POST /:id/read — marcar como leído
router.post('/:id/read', async (req, res) => {
  try {
    await sequelize.query(
      `INSERT INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE read_at = VALUES(read_at)`,
      { replacements: [parseInt(req.params.id, 10), req.user.id] }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — editar
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[a]] = await sequelize.query('SELECT created_by FROM announcements WHERE id = ?', { replacements: [id] });
    if (!a) return res.status(404).json({ error: 'No encontrado' });
    const isAdmin = ['admin', 'gth', 'super_admin'].includes(req.user?.role);
    if (!isAdmin && a.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el autor o admin pueden editar' });
    }
    const allowed = ['title','body','priority','require_ack','pinned','expires_at'];
    const sets = []; const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
    await sequelize.query(`UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`,
      { replacements: [...vals, id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[a]] = await sequelize.query('SELECT created_by FROM announcements WHERE id = ?', { replacements: [id] });
    if (!a) return res.status(404).json({ error: 'No encontrado' });
    const isAdmin = ['admin', 'gth', 'super_admin'].includes(req.user?.role);
    if (!isAdmin && a.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el autor o admin pueden eliminar' });
    }
    await sequelize.query('DELETE FROM announcements WHERE id = ?', { replacements: [id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
