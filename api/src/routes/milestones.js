/**
 * milestones.js — Cumpleaños y aniversarios laborales.
 *
 * GET /api/milestones/birthdays?month=&days=&deptId=
 *   Empleados con cumpleaños en el mes (default: mes actual) o en los próximos N días.
 *
 * GET /api/milestones/anniversaries?month=&days=&deptId=
 *   Empleados con aniversario laboral (hire_date) en el mes/próximos N días.
 *   Incluye 'years' (años de antigüedad que cumplen).
 *
 * GET /api/milestones/today
 *   Atajo: cumpleaños y aniversarios del día actual.
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

function buildDeptFilter(deptId) {
  if (!deptId) return { sql: '', params: [] };
  return { sql: ' AND e.department_id = ?', params: [parseInt(deptId, 10)] };
}

// GET /api/milestones/birthdays — cumpleaños en el mes o próximos N días
router.get('/birthdays', async (req, res) => {
  try {
    const month = req.query.month ? parseInt(req.query.month, 10) : null;
    const days  = req.query.days  ? parseInt(req.query.days, 10)  : null;
    const dept  = buildDeptFilter(req.query.deptId);

    let where = "WHERE e.status = 'active' AND e.birth_date IS NOT NULL";
    const params = [];

    if (days && days > 0) {
      // Próximos N días (cruza fin de año correctamente)
      where += ` AND (
        (DATE(CONCAT(YEAR(CURDATE()), '-', MONTH(e.birth_date), '-', DAY(e.birth_date)))
            BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
        OR (DATE(CONCAT(YEAR(CURDATE()) + 1, '-', MONTH(e.birth_date), '-', DAY(e.birth_date)))
            BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
      )`;
      params.push(days, days);
    } else {
      const m = month || (new Date().getMonth() + 1);
      where += ' AND MONTH(e.birth_date) = ?';
      params.push(m);
    }

    where += dept.sql;
    params.push(...dept.params);

    const [rows] = await sequelize.query(`
      SELECT
        e.id, e.code, e.first_name, e.last_name,
        CONCAT(e.first_name,' ',e.last_name) AS full_name,
        e.email, e.position, e.birth_date,
        d.name AS department,
        DAY(e.birth_date)   AS day,
        MONTH(e.birth_date) AS month,
        TIMESTAMPDIFF(YEAR, e.birth_date,
          DATE(CONCAT(YEAR(CURDATE()),'-',MONTH(e.birth_date),'-',DAY(e.birth_date)))) AS turning_age
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      ${where}
      ORDER BY MONTH(e.birth_date), DAY(e.birth_date), e.last_name
    `, { replacements: params });

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/milestones/anniversaries — aniversarios laborales
router.get('/anniversaries', async (req, res) => {
  try {
    const month = req.query.month ? parseInt(req.query.month, 10) : null;
    const days  = req.query.days  ? parseInt(req.query.days, 10)  : null;
    const dept  = buildDeptFilter(req.query.deptId);

    let where = "WHERE e.status = 'active' AND e.hire_date IS NOT NULL";
    const params = [];

    if (days && days > 0) {
      where += ` AND (
        (DATE(CONCAT(YEAR(CURDATE()), '-', MONTH(e.hire_date), '-', DAY(e.hire_date)))
            BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
        OR (DATE(CONCAT(YEAR(CURDATE()) + 1, '-', MONTH(e.hire_date), '-', DAY(e.hire_date)))
            BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
      )`;
      params.push(days, days);
    } else {
      const m = month || (new Date().getMonth() + 1);
      where += ' AND MONTH(e.hire_date) = ?';
      params.push(m);
    }

    where += dept.sql;
    params.push(...dept.params);

    const [rows] = await sequelize.query(`
      SELECT
        e.id, e.code, e.first_name, e.last_name,
        CONCAT(e.first_name,' ',e.last_name) AS full_name,
        e.email, e.position, e.hire_date,
        d.name AS department,
        DAY(e.hire_date)   AS day,
        MONTH(e.hire_date) AS month,
        TIMESTAMPDIFF(YEAR, e.hire_date,
          DATE(CONCAT(YEAR(CURDATE()),'-',MONTH(e.hire_date),'-',DAY(e.hire_date)))) AS years
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      ${where}
      ORDER BY MONTH(e.hire_date), DAY(e.hire_date), e.last_name
    `, { replacements: params });

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/milestones/today — combinado del día
router.get('/today', async (_req, res) => {
  try {
    const [birth] = await sequelize.query(`
      SELECT e.id, e.code, CONCAT(e.first_name,' ',e.last_name) AS full_name,
             e.email, d.name AS department,
             TIMESTAMPDIFF(YEAR, e.birth_date, CURDATE()) AS turning_age
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status='active'
        AND e.birth_date IS NOT NULL
        AND MONTH(e.birth_date) = MONTH(CURDATE())
        AND DAY(e.birth_date)   = DAY(CURDATE())
      ORDER BY e.last_name
    `);

    const [anniv] = await sequelize.query(`
      SELECT e.id, e.code, CONCAT(e.first_name,' ',e.last_name) AS full_name,
             e.email, d.name AS department,
             TIMESTAMPDIFF(YEAR, e.hire_date, CURDATE()) AS years
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status='active'
        AND e.hire_date IS NOT NULL
        AND MONTH(e.hire_date) = MONTH(CURDATE())
        AND DAY(e.hire_date)   = DAY(CURDATE())
        AND TIMESTAMPDIFF(YEAR, e.hire_date, CURDATE()) > 0
      ORDER BY e.last_name
    `);

    res.json({ ok: true, birthdays: birth, anniversaries: anniv });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
