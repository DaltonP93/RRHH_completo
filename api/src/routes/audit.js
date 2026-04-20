/**
 * audit.js — consulta de auditoría.
 * Sólo admin / gth / super_admin pueden leer.
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate, authorize('admin', 'gth'));

// GET /api/audit?action=&user_id=&from=&to=&limit=200
router.get('/', async (req, res) => {
  const { action, user_id, from, to } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);

  let where = 'WHERE 1=1';
  const params = [];
  if (action)  { where += ' AND a.action = ?';    params.push(action); }
  if (user_id) { where += ' AND a.user_id = ?';   params.push(user_id); }
  if (from)    { where += ' AND a.created_at >= ?'; params.push(from + ' 00:00:00'); }
  if (to)      { where += ' AND a.created_at <= ?'; params.push(to + ' 23:59:59'); }

  try {
    const [rows] = await sequelize.query(`
      SELECT a.id, a.user_id, a.username, a.action, a.entity, a.entity_id,
             a.ip, a.user_agent, a.details, a.created_at,
             u.full_name AS actor_name, u.role AS actor_role
      FROM audit_events a
      LEFT JOIN users u ON a.user_id = u.id
      ${where}
      ORDER BY a.id DESC
      LIMIT ?
    `, { replacements: [...params, limit] });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/actions — listado de acciones distintas (para el filtro)
router.get('/actions', async (_req, res) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT action, COUNT(*) AS total FROM audit_events GROUP BY action ORDER BY total DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
