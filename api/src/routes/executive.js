/**
 * executive.js — Endpoints para el Dashboard Ejecutivo.
 *  - KPIs del mes vs mes anterior
 *  - Ranking de departamentos por asistencia y puntualidad
 *  - Heatmap día-de-semana × semana del mes
 *  - Tendencia de 6 meses
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);
router.use(authorize('admin', 'hr', 'gth', 'super_admin', 'manager'));
router.use(requirePermission('ejecutivo', 'view'));

function monthRange(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to   = new Date(year, month, 0).toISOString().slice(0, 10);
  return { from, to };
}

async function monthStats(year, month, branchId) {
  const { from, to } = monthRange(year, month);
  const bFilter = branchId ? ' AND e.branch_id = ?' : '';
  const params  = branchId ? [from, to, branchId] : [from, to];

  const [[kpi]] = await sequelize.query(`
    SELECT
      COUNT(DISTINCT e.id) AS employees,
      SUM(CASE WHEN ds.status IN ('present','late') THEN 1 ELSE 0 END) AS present_days,
      SUM(CASE WHEN ds.status = 'late'   THEN 1 ELSE 0 END) AS late_days,
      SUM(CASE WHEN ds.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
      SUM(COALESCE(ds.worked_minutes,0))   AS worked_minutes,
      SUM(COALESCE(ds.late_minutes,0))     AS late_minutes,
      SUM(COALESCE(ds.overtime_minutes,0)) AS overtime_minutes
    FROM employees e
    LEFT JOIN daily_summary ds ON ds.employee_id = e.id AND ds.date BETWEEN ? AND ?
    WHERE e.status = 'active' ${bFilter}
  `, { replacements: params });
  return kpi;
}

// GET /api/executive/overview?year=&month=&branch_id=
router.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const year  = +(req.query.year  || now.getFullYear());
    const month = +(req.query.month || (now.getMonth() + 1));
    const branchId = req.query.branch_id ? +req.query.branch_id : null;

    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;

    const [cur, prev] = await Promise.all([
      monthStats(year, month, branchId),
      monthStats(prevY, prevM, branchId),
    ]);

    // Ranking por departamento
    const { from, to } = monthRange(year, month);
    const bFilter = branchId ? ' AND e.branch_id = ?' : '';
    const params  = branchId ? [from, to, branchId] : [from, to];
    const [byDept] = await sequelize.query(`
      SELECT
        d.id, d.name,
        COUNT(DISTINCT e.id) AS employees,
        SUM(CASE WHEN ds.status IN ('present','late') THEN 1 ELSE 0 END) AS present_days,
        SUM(CASE WHEN ds.status = 'late'   THEN 1 ELSE 0 END) AS late_days,
        SUM(CASE WHEN ds.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
        SUM(COALESCE(ds.late_minutes,0)) AS late_minutes
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'active'
      LEFT JOIN daily_summary ds ON ds.employee_id = e.id AND ds.date BETWEEN ? AND ?
      WHERE d.active = 1 ${bFilter}
      GROUP BY d.id
      ORDER BY late_minutes ASC
    `, { replacements: params });

    // Heatmap día-de-semana (0=Dom..6=Sab)
    const [heatmap] = await sequelize.query(`
      SELECT
        DAYOFWEEK(ds.date) - 1 AS dow,
        WEEK(ds.date, 3) - WEEK(?, 3) + 1 AS week_idx,
        SUM(CASE WHEN ds.status IN ('present','late') THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN ds.status = 'absent' THEN 1 ELSE 0 END) AS absent,
        SUM(COALESCE(ds.late_minutes,0)) AS late_minutes
      FROM daily_summary ds
      JOIN employees e ON e.id = ds.employee_id
      WHERE ds.date BETWEEN ? AND ? AND e.status = 'active' ${bFilter}
      GROUP BY dow, week_idx
      ORDER BY week_idx, dow
    `, { replacements: branchId ? [from, from, to, branchId] : [from, from, to] });

    // Tendencia últimos 6 meses
    const [trend] = await sequelize.query(`
      SELECT
        DATE_FORMAT(ds.date, '%Y-%m') AS period,
        SUM(CASE WHEN ds.status IN ('present','late') THEN 1 ELSE 0 END) AS present_days,
        SUM(CASE WHEN ds.status = 'late'   THEN 1 ELSE 0 END) AS late_days,
        SUM(CASE WHEN ds.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
        SUM(COALESCE(ds.worked_minutes,0)) AS worked_minutes,
        SUM(COALESCE(ds.late_minutes,0))   AS late_minutes
      FROM daily_summary ds
      JOIN employees e ON e.id = ds.employee_id
      WHERE ds.date >= DATE_SUB(?, INTERVAL 6 MONTH) AND ds.date <= ?
        AND e.status = 'active' ${bFilter}
      GROUP BY period
      ORDER BY period ASC
    `, { replacements: branchId ? [from, to, branchId] : [from, to] });

    res.json({
      period: { year, month, from, to, branch_id: branchId },
      kpis: {
        current: cur,
        previous: prev,
      },
      byDepartment: byDept,
      heatmap,
      trend,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
