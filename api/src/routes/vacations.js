/**
 * vacations.js — Plan visual de vacaciones y permisos.
 *
 * GET /api/vacations/plan?year=&month=&deptId=
 *   Devuelve para un mes (o un año entero si month=0):
 *     - days[] con feriados
 *     - employees[] con franjas { date_from, date_to, type, status, days } por empleado
 *
 * GET /api/vacations/conflicts?date_from=&date_to=&deptId=
 *   Detecta empleados solapados en un rango (útil al planificar).
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);
router.use(authorize('admin', 'gth', 'hr', 'manager', 'coordinator', 'gestor', 'supervisor'));

function monthBounds(year, month) {
  if (month === 0) {
    return {
      from: `${year}-01-01`,
      to:   `${year}-12-31`,
    };
  }
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${m}-01`,
    to:   `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

router.get('/plan', requirePermission('reportes', 'view'), async (req, res) => {
  try {
    const year   = parseInt(req.query.year  || new Date().getFullYear(), 10);
    const month  = parseInt(req.query.month || (new Date().getMonth() + 1), 10);
    const deptId = req.query.deptId ? parseInt(req.query.deptId, 10) : null;
    const { from, to } = monthBounds(year, month);

    const empParams = [from, to];
    let deptFilter = '';
    if (deptId) { deptFilter = ' AND e.department_id = ?'; empParams.push(deptId); }

    // Permisos que tocan el período (incluye solapamiento)
    const [rows] = await sequelize.query(`
      SELECT
        p.id, p.type, p.date_from, p.date_to, p.status, p.reason,
        p.employee_id,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        e.code, e.position,
        d.name AS department, d.id AS department_id,
        DATEDIFF(p.date_to, p.date_from) + 1 AS days
      FROM permissions p
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE p.status IN ('pending','approved')
        AND p.date_from <= ? AND p.date_to >= ?
        ${deptFilter}
      ORDER BY e.last_name, p.date_from
    `, { replacements: [to, from, ...(deptId ? [deptId] : [])] });

    // Feriados del período
    const [holidays] = await sequelize.query(
      'SELECT date, name FROM holidays WHERE date BETWEEN ? AND ? ORDER BY date',
      { replacements: [from, to] }
    );

    // Agrupar por empleado para vista
    const byEmp = {};
    for (const r of rows) {
      if (!byEmp[r.employee_id]) {
        byEmp[r.employee_id] = {
          id: r.employee_id, employee_name: r.employee_name, code: r.code,
          position: r.position, department: r.department,
          ranges: [],
        };
      }
      byEmp[r.employee_id].ranges.push({
        id: r.id, type: r.type, status: r.status, reason: r.reason,
        date_from: r.date_from, date_to: r.date_to, days: r.days,
      });
    }

    res.json({
      ok: true,
      period: { year, month, from, to },
      employees: Object.values(byEmp),
      holidays,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detecta conflictos: empleados con vacaciones solapadas en un rango específico
router.get('/conflicts', async (req, res) => {
  try {
    const { date_from, date_to, deptId } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'date_from y date_to son requeridos' });
    }
    const params = [date_to, date_from];
    let deptFilter = '';
    if (deptId) { deptFilter = ' AND e.department_id = ?'; params.push(parseInt(deptId, 10)); }

    const [rows] = await sequelize.query(`
      SELECT
        p.id, p.type, p.date_from, p.date_to, p.status,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        e.code, d.name AS department,
        d.id AS department_id
      FROM permissions p
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE p.status IN ('pending','approved')
        AND p.date_from <= ? AND p.date_to >= ?
        ${deptFilter}
      ORDER BY d.name, p.date_from
    `, { replacements: params });

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
