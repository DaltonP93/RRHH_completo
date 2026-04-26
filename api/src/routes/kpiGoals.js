/**
 * kpiGoals.js — Metas/objetivos de KPIs y cálculo de progreso.
 *
 * GET    /api/kpi-goals              → listado
 * POST   /api/kpi-goals              → crear (admin/gth)
 * PUT    /api/kpi-goals/:id          → actualizar (admin/gth)
 * DELETE /api/kpi-goals/:id          → eliminar (admin)
 * GET    /api/kpi-goals/progress?year=&month=&deptId=
 *   Devuelve para cada meta activa: target, current, status (ok/warn/crit), pct.
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// GET listado (cualquier rol con view dashboard puede leerlo)
router.get('/', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT g.*, d.name AS department_name
      FROM kpi_goals g
      LEFT JOIN departments d ON d.id = g.department_id
      ORDER BY g.scope, g.metric
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD restringido
router.post('/',
  authorize('admin', 'gth'),
  requirePermission('configuracion', 'create'),
  async (req, res) => {
    const {
      metric, period_type = 'monthly', scope = 'global',
      department_id = null, target_value, threshold_warn, threshold_crit,
      direction = 'higher_is_better', unit = '%', description,
    } = req.body;
    if (!metric || target_value == null) {
      return res.status(400).json({ error: 'metric y target_value son requeridos' });
    }
    try {
      const [r] = await sequelize.query(`
        INSERT INTO kpi_goals (metric, period_type, scope, department_id, target_value, threshold_warn, threshold_crit, direction, unit, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          target_value = VALUES(target_value),
          threshold_warn = VALUES(threshold_warn),
          threshold_crit = VALUES(threshold_crit),
          direction = VALUES(direction),
          unit = VALUES(unit),
          description = VALUES(description)
      `, { replacements: [metric, period_type, scope, department_id, target_value, threshold_warn, threshold_crit, direction, unit, description] });
      res.json({ ok: true, id: r });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.put('/:id',
  authorize('admin', 'gth'),
  requirePermission('configuracion', 'update'),
  async (req, res) => {
    const allowed = ['target_value','threshold_warn','threshold_crit','direction','unit','description','active'];
    const sets = []; const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
    try {
      await sequelize.query(`UPDATE kpi_goals SET ${sets.join(', ')} WHERE id = ?`,
        { replacements: [...vals, req.params.id] });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    await sequelize.query('DELETE FROM kpi_goals WHERE id = ?', { replacements: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cálculo de progreso vs metas ────────────────────────────────
function monthBounds(year, month) {
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${m}-01`,
    to:   `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

router.get('/progress', async (req, res) => {
  try {
    const year   = parseInt(req.query.year || new Date().getFullYear(), 10);
    const month  = parseInt(req.query.month || (new Date().getMonth() + 1), 10);
    const deptId = req.query.deptId ? parseInt(req.query.deptId, 10) : null;
    const { from, to } = monthBounds(year, month);

    // Cargar metas activas (global + opcional de departamento)
    const goalParams = [];
    let goalWhere = "g.active = 1 AND (g.scope = 'global'";
    if (deptId) { goalWhere += ' OR g.department_id = ?'; goalParams.push(deptId); }
    goalWhere += ')';

    const [goals] = await sequelize.query(
      `SELECT g.*, d.name AS department_name FROM kpi_goals g LEFT JOIN departments d ON d.id = g.department_id WHERE ${goalWhere}`,
      { replacements: goalParams }
    );

    // Métricas calculadas del período (a partir de daily_summary)
    const params = [from, to];
    let deptFilter = '';
    if (deptId) { deptFilter = ' AND e.department_id = ?'; params.push(deptId); }

    const [[stats]] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT ds.employee_id) AS employees_with_records,
        SUM(CASE WHEN ds.status IN ('present','late') THEN 1 ELSE 0 END) AS present_days,
        SUM(CASE WHEN ds.status = 'late' THEN 1 ELSE 0 END) AS late_days,
        SUM(CASE WHEN ds.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
        SUM(COALESCE(ds.overtime_minutes, 0)) AS overtime_total,
        COUNT(*) AS total_records
      FROM daily_summary ds
      JOIN employees e ON e.id = ds.employee_id
      WHERE ds.date BETWEEN ? AND ? AND e.status = 'active' ${deptFilter}
    `, { replacements: params });

    const total = Number(stats?.total_records) || 0;
    const totalEmployees = Number(stats?.employees_with_records) || 1;
    const metrics = {
      attendance_rate: total ? ((Number(stats.present_days) / total) * 100) : 0,
      late_rate:       total ? ((Number(stats.late_days)    / total) * 100) : 0,
      absent_rate:     total ? ((Number(stats.absent_days)  / total) * 100) : 0,
      overtime_avg:    totalEmployees ? (Number(stats.overtime_total) / totalEmployees) : 0,
    };

    // Evaluar cada meta
    const evaluated = goals.map((g) => {
      const current = metrics[g.metric] != null ? Number(metrics[g.metric]) : null;
      const target  = Number(g.target_value);
      const warn    = g.threshold_warn != null ? Number(g.threshold_warn) : null;
      const crit    = g.threshold_crit != null ? Number(g.threshold_crit) : null;

      let status = 'unknown';
      if (current != null) {
        if (g.direction === 'higher_is_better') {
          if (current >= target)        status = 'ok';
          else if (warn != null && current >= warn) status = 'warn';
          else                          status = 'crit';
        } else {
          if (current <= target)        status = 'ok';
          else if (warn != null && current <= warn) status = 'warn';
          else                          status = 'crit';
        }
      }

      const pct = current != null && target > 0
        ? (g.direction === 'higher_is_better'
            ? Math.min(100, (current / target) * 100)
            : Math.min(100, (target  / Math.max(current, 0.01)) * 100))
        : 0;

      return {
        id: g.id, metric: g.metric, scope: g.scope, department: g.department_name,
        period_type: g.period_type, direction: g.direction, unit: g.unit, description: g.description,
        target, threshold_warn: warn, threshold_crit: crit,
        current: current != null ? Number(current.toFixed(2)) : null,
        status, pct: Number(pct.toFixed(1)),
      };
    });

    res.json({ ok: true, period: { year, month, from, to }, goals: evaluated, raw: metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
