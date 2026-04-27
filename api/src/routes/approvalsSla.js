/**
 * approvalsSla.js — Métricas de SLA en aprobaciones de permisos.
 *
 * GET /api/approvals-sla/overdue?days=30
 *   Listado de permisos con SLA vencido (todavía pendientes y ya pasaron > sla_hours).
 *
 * GET /api/approvals-sla/stats?from=&to=
 *   Resumen: cuántos en SLA, cuántos vencidos, tiempo promedio de aprobación.
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);
router.use(authorize('admin', 'gth', 'hr', 'manager', 'coordinator', 'gestor'));

// GET /overdue — permisos pendientes con SLA vencido
router.get('/overdue', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
    const [rows] = await sequelize.query(`
      SELECT
        p.id, p.type, p.date_from, p.date_to, p.status, p.reason, p.created_at,
        p.sla_due_at,
        TIMESTAMPDIFF(HOUR, p.created_at, NOW()) AS hours_open,
        TIMESTAMPDIFF(HOUR, p.sla_due_at, NOW()) AS hours_overdue,
        e.id AS employee_id, e.code,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        d.name AS department
      FROM permissions p
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE p.status IN ('pending','level1_ok','level2_ok')
        AND p.sla_due_at IS NOT NULL
        AND p.sla_due_at < NOW()
        AND p.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY p.sla_due_at ASC
    `, { replacements: [days] });
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats — métricas de SLA del período
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const from = req.query.from || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to   = req.query.to   || today;

    const [[stats]] = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status IN ('pending','level1_ok','level2_ok') THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status IN ('pending','level1_ok','level2_ok') AND sla_due_at < NOW() THEN 1 ELSE 0 END) AS overdue,
        AVG(CASE WHEN status = 'approved' AND approved_at IS NOT NULL
                 THEN TIMESTAMPDIFF(HOUR, created_at, approved_at) END) AS avg_hours_to_approve,
        AVG(CASE WHEN level1_at IS NOT NULL
                 THEN TIMESTAMPDIFF(HOUR, created_at, level1_at) END) AS avg_hours_level1
      FROM permissions
      WHERE created_at BETWEEN ? AND CONCAT(?, ' 23:59:59')
    `, { replacements: [from, to] });

    res.json({
      ok: true,
      period: { from, to },
      stats: {
        total: Number(stats?.total || 0),
        approved: Number(stats?.approved || 0),
        rejected: Number(stats?.rejected || 0),
        in_progress: Number(stats?.in_progress || 0),
        overdue: Number(stats?.overdue || 0),
        avg_hours_to_approve: stats?.avg_hours_to_approve != null ? Number(stats.avg_hours_to_approve).toFixed(1) : null,
        avg_hours_level1:     stats?.avg_hours_level1     != null ? Number(stats.avg_hours_level1).toFixed(1)     : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
