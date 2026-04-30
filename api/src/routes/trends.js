/**
 * trends.js — Tendencias históricas con forecast simple (regresión lineal).
 *
 * GET /api/trends/attendance?months=12&forecast=3&deptId=
 *   Devuelve serie mensual de presentes/atrasos/ausentes + proyección
 *   de los próximos N meses calculada via regresión lineal.
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// Helper: regresión lineal simple sobre puntos (x=0..n-1, y=values)
function linearForecast(values, steps) {
  const n = values.length;
  if (n < 2) return Array(steps).fill(values[0] || 0);
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * values[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = (n * sumXX - sumX * sumX) || 1;
  const slope     = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const forecast = [];
  for (let i = n; i < n + steps; i++) {
    forecast.push(Math.max(0, Math.round((intercept + slope * i) * 100) / 100));
  }
  return forecast;
}

router.get('/attendance',
  authorize('admin', 'gth', 'hr', 'manager', 'gestor', 'super_admin'),
  requirePermission('reportes', 'view'),
  async (req, res) => {
    try {
      const months   = Math.min(36, Math.max(3, parseInt(req.query.months || '12', 10)));
      const forecast = Math.min(12, Math.max(0, parseInt(req.query.forecast || '3', 10)));
      const deptId   = req.query.deptId ? parseInt(req.query.deptId, 10) : null;

      const params = [months];
      let dFilter = '';
      if (deptId) { dFilter = ' AND e.department_id = ?'; params.push(deptId); }

      const [rows] = await sequelize.query(`
        SELECT
          DATE_FORMAT(ds.date, '%Y-%m') AS period,
          SUM(CASE WHEN ds.status = 'present' THEN 1 ELSE 0 END) AS present,
          SUM(CASE WHEN ds.status = 'late'    THEN 1 ELSE 0 END) AS late_days,
          SUM(CASE WHEN ds.status = 'absent'  THEN 1 ELSE 0 END) AS absent_days,
          SUM(COALESCE(ds.late_minutes, 0))     AS late_minutes,
          SUM(COALESCE(ds.overtime_minutes, 0)) AS overtime_minutes
        FROM daily_summary ds
        JOIN employees e ON e.id = ds.employee_id
        WHERE ds.date >= DATE_SUB(LAST_DAY(CURDATE() - INTERVAL 1 MONTH), INTERVAL ? MONTH)
          AND ds.date <= LAST_DAY(CURDATE())
          AND e.status = 'active' ${dFilter}
        GROUP BY period
        ORDER BY period
      `, { replacements: params });

      // Series para forecast
      const presentSeries  = rows.map(r => Number(r.present));
      const lateSeries     = rows.map(r => Number(r.late_days));
      const absentSeries   = rows.map(r => Number(r.absent_days));
      const overtimeSeries = rows.map(r => Number(r.overtime_minutes));

      // Generar fechas futuras
      const future = [];
      const last = rows.length ? rows[rows.length - 1].period : null;
      if (last) {
        const [yStr, mStr] = last.split('-');
        let y = +yStr, m = +mStr;
        for (let i = 0; i < forecast; i++) {
          m++;
          if (m > 12) { m = 1; y++; }
          future.push(`${y}-${String(m).padStart(2, '0')}`);
        }
      }

      const presentFc  = linearForecast(presentSeries,  forecast);
      const lateFc     = linearForecast(lateSeries,     forecast);
      const absentFc   = linearForecast(absentSeries,   forecast);
      const overtimeFc = linearForecast(overtimeSeries, forecast);

      const data = [
        ...rows.map(r => ({
          period: r.period,
          present: Number(r.present),
          late_days: Number(r.late_days),
          absent_days: Number(r.absent_days),
          overtime_minutes: Number(r.overtime_minutes),
          forecasted: false,
        })),
        ...future.map((p, i) => ({
          period: p,
          present:           presentFc[i],
          late_days:         lateFc[i],
          absent_days:       absentFc[i],
          overtime_minutes:  overtimeFc[i],
          forecasted: true,
        })),
      ];

      res.json({ ok: true, data, history_months: rows.length, forecast_months: forecast });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

module.exports = router;
