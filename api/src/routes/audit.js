/**
 * audit.js — consulta de auditoría.
 * Sólo admin / gth / super_admin pueden leer.
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate, authorize('admin', 'gth'), requirePermission('auditoria', 'view'));

function buildFilter(q) {
  const { action, user_id, entity, q: search, from, to } = q;
  let where = 'WHERE 1=1';
  const params = [];
  if (action)  { where += ' AND a.action = ?';        params.push(action); }
  if (user_id) { where += ' AND a.user_id = ?';       params.push(user_id); }
  if (entity)  { where += ' AND a.entity = ?';        params.push(entity); }
  if (search)  { where += ' AND (a.username LIKE ? OR u.full_name LIKE ? OR a.details LIKE ?)';
                 params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (from)    { where += ' AND a.created_at >= ?';   params.push(from + ' 00:00:00'); }
  if (to)      { where += ' AND a.created_at <= ?';   params.push(to + ' 23:59:59'); }
  return { where, params };
}

// GET /api/audit?action=&user_id=&entity=&q=&from=&to=&limit=&offset=
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 200, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { where, params } = buildFilter(req.query);

  try {
    const [rows] = await sequelize.query(`
      SELECT a.id, a.user_id, a.username, a.action, a.entity, a.entity_id,
             a.ip, a.user_agent, a.details, a.created_at,
             u.full_name AS actor_name, u.role AS actor_role
      FROM audit_events a
      LEFT JOIN users u ON a.user_id = u.id
      ${where}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `, { replacements: [...params, limit, offset] });
    const [[{ total }]] = await sequelize.query(`
      SELECT COUNT(*) AS total FROM audit_events a LEFT JOIN users u ON a.user_id = u.id ${where}
    `, { replacements: params });
    res.json({ rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/export.csv — descarga CSV con los mismos filtros
router.get('/export.csv', async (req, res) => {
  const { where, params } = buildFilter(req.query);
  try {
    const [rows] = await sequelize.query(`
      SELECT a.id, a.created_at, a.action, a.entity, a.entity_id,
             COALESCE(u.full_name, a.username) AS user, u.role, a.ip, a.details
      FROM audit_events a LEFT JOIN users u ON a.user_id = u.id
      ${where} ORDER BY a.id DESC LIMIT 10000
    `, { replacements: params });
    const headers = ['id','created_at','action','entity','entity_id','user','role','ip','details'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const out = [headers.join(';'), ...rows.map(r => headers.map(h => esc(r[h])).join(';'))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_${Date.now()}.csv"`);
    res.send('\uFEFF' + out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/entities — listado de entidades distintas
router.get('/entities', async (_req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT entity, COUNT(*) AS total FROM audit_events WHERE entity IS NOT NULL AND entity <> '' GROUP BY entity ORDER BY total DESC"
    );
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
