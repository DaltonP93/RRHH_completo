const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { generateMarcadasReport, buildMarcadasTableHtml, minsToHM } = require('../services/scheduler');
const { sendMail, buildReportEmailHtml } = require('../services/emailService');

router.use(authenticate);

// GET /api/reports/monthly?year=&month=&dept=
router.get('/monthly', async (req, res) => {
  const { year = new Date().getFullYear(), month = new Date().getMonth() + 1, dept } = req.query;
  const dateFrom = `${year}-${String(month).padStart(2,'0')}-01`;
  const dateTo   = new Date(year, month, 0).toISOString().split('T')[0];

  let deptFilter = '';
  const params = [dateFrom, dateTo];
  if (dept) { deptFilter = 'AND e.department_id = ?'; params.push(dept); }

  const [rows] = await sequelize.query(`
    SELECT
      e.id, e.code, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
      d.name AS department,
      COUNT(CASE WHEN ds.status IN ('present','late') THEN 1 END)  AS days_present,
      COUNT(CASE WHEN ds.status = 'late'              THEN 1 END)  AS days_late,
      COUNT(CASE WHEN ds.status = 'absent'            THEN 1 END)  AS days_absent,
      SUM(ds.worked_minutes)                                        AS total_worked_minutes,
      SUM(ds.late_minutes)                                          AS total_late_minutes,
      SUM(ds.overtime_minutes)                                      AS total_overtime_minutes
    FROM employees e
    LEFT JOIN daily_summary ds ON e.id = ds.employee_id AND ds.date BETWEEN ? AND ?
    LEFT JOIN departments   d  ON e.department_id = d.id
    WHERE e.status = 'active' ${deptFilter}
    GROUP BY e.id
    ORDER BY d.name, e.last_name
  `, { replacements: params });

  res.json({ data: rows, period: { year, month, from: dateFrom, to: dateTo } });
});

// GET /api/reports/weekly?week=&year=
router.get('/weekly', async (req, res) => {
  const now = new Date();
  const { year = now.getFullYear(), week } = req.query;

  // Calcular inicio y fin de la semana
  const jan1 = new Date(year, 0, 1);
  const weekNum = week || Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  const from = new Date(jan1.getTime() + (weekNum - 1) * 7 * 86400000);
  const to   = new Date(from.getTime() + 6 * 86400000);

  const [rows] = await sequelize.query(`
    SELECT
      ds.date, ds.status, ds.first_in, ds.last_out, ds.worked_minutes, ds.late_minutes,
      CONCAT(e.first_name,' ',e.last_name) AS employee_name, d.name AS department
    FROM daily_summary ds
    JOIN employees e ON ds.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE ds.date BETWEEN ? AND ?
    ORDER BY ds.date, e.last_name
  `, { replacements: [from.toISOString().split('T')[0], to.toISOString().split('T')[0]] });

  res.json({ data: rows, week: weekNum, from, to });
});

// ─── GET /api/reports/marcadas ─────────────────────────────────────
// Reporte detallado por empleado: múltiples entradas/salidas por día
// igual al "Reporte Marcadas por Empleado" del sistema ZKTeco original
router.get('/marcadas', async (req, res) => {
  const { from, to, employeeId, deptId } = req.query;
  try {
    const result = await generateMarcadasReport({ dateFrom: from, dateTo: to, employeeId, deptId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/reports/daily-detail?date= ─────────────────────────
// Reporte del día con todos los logs crudos por empleado
router.get('/daily-detail', async (req, res) => {
  const { date = new Date().toISOString().split('T')[0], dept } = req.query;
  let filter = '';
  const params = [date];
  if (dept) { filter = 'AND e.department_id = ?'; params.push(dept); }

  const [rows] = await sequelize.query(`
    SELECT
      e.id AS employee_id, e.code,
      CONCAT(e.first_name,' ',e.last_name) AS employee_name,
      d.name AS department, s.name AS schedule,
      s.check_in AS scheduled_in, s.check_out AS scheduled_out,
      ds.first_in, ds.last_out, ds.worked_minutes, ds.late_minutes,
      ds.overtime_minutes, ds.status, ds.justification, ds.justification_type,
      GROUP_CONCAT(
        CONCAT(DATE_FORMAT(al.timestamp,'%H:%i'), '=', al.type)
        ORDER BY al.timestamp SEPARATOR '|'
      ) AS marks_raw
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN schedules s ON e.schedule_id = s.id
    LEFT JOIN daily_summary ds ON e.id = ds.employee_id AND ds.date = ?
    LEFT JOIN attendance_logs al ON e.id = al.employee_id AND DATE(al.timestamp) = ?
    WHERE e.status = 'active' ${filter}
    GROUP BY e.id
    ORDER BY d.name, e.last_name
  `, { replacements: [date, date, ...params.slice(1)] });

  // Parsear marks_raw a array
  const data = rows.map(r => ({
    ...r,
    marks: r.marks_raw ? r.marks_raw.split('|').map(m => {
      const [time, type] = m.split('=');
      return { time, type };
    }) : [],
    marks_raw: undefined,
  }));

  res.json({ date, data });
});

// ─── POST /api/reports/marcadas/email ─────────────────────────────
// Generar y enviar reporte por email inmediatamente
router.post('/marcadas/email', async (req, res) => {
  const { from, to, employeeId, deptId, recipients } = req.body;
  if (!recipients || !recipients.length) {
    return res.status(400).json({ error: 'recipients requerido' });
  }

  try {
    const report = await generateMarcadasReport({ dateFrom: from, dateTo: to, employeeId, deptId });

    const tableHtmlParts = report.data.map(emp => `
      <h3 style="margin-top:20px">${emp.employee_name} [${emp.code}]${emp.department ? ' — ' + emp.department : ''}</h3>
      ${buildMarcadasTableHtml(emp)}
      <p style="text-align:right;font-weight:bold;color:#1e40af">Total período: ${emp.total_hm}</p>
    `).join('<hr>');

    const html = buildReportEmailHtml({
      title: 'Reporte de Marcadas por Empleado',
      period: `${from || 'Hoy'} al ${to || 'Hoy'}`,
      tableHtml: tableHtmlParts || '<p>Sin registros en este período</p>',
    });

    const result = await sendMail({
      to: recipients,
      subject: `Reporte de Marcadas — ${from} al ${to}`,
      html,
    });

    res.json({ ...result, employees: report.data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/reports/attendance/justify ─────────────────────────
// Justificar una ausencia / tardanza
router.post('/attendance/justify', async (req, res) => {
  const { employeeId, date, justification, justificationType } = req.body;
  if (!employeeId || !date || !justification) {
    return res.status(400).json({ error: 'employeeId, date y justification son requeridos' });
  }
  await sequelize.query(`
    INSERT INTO daily_summary (employee_id, date, justification, justification_type, status)
    VALUES (?, ?, ?, ?, 'permission')
    ON DUPLICATE KEY UPDATE
      justification      = VALUES(justification),
      justification_type = VALUES(justification_type),
      status = CASE
        WHEN status = 'absent' THEN 'permission'
        ELSE status
      END
  `, { replacements: [employeeId, date, justification, justificationType || 'other'] });

  res.json({ message: 'Justificación registrada' });
});

// ─── GET /api/reports/employee/:id/analytics ──────────────────────
// Datos de analytics profundos por empleado: tendencias, comparativas, heatmap
router.get('/employee/:id/analytics', async (req, res) => {
  const { months = 3 } = req.query;
  const empId = req.params.id;
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - +months);
  const from = dateFrom.toISOString().split('T')[0];
  const to   = new Date().toISOString().split('T')[0];

  try {
    // Datos diarios
    const [daily] = await sequelize.query(`
      SELECT
        ds.date, ds.status, ds.worked_minutes, ds.late_minutes,
        ds.overtime_minutes, ds.first_in, ds.last_out,
        ds.justification, ds.justification_type
      FROM daily_summary ds
      WHERE ds.employee_id = ? AND ds.date BETWEEN ? AND ?
      ORDER BY ds.date
    `, { replacements: [empId, from, to] });

    // Resumen del período
    const present = daily.filter(d => ['present','late'].includes(d.status)).length;
    const late    = daily.filter(d => d.status === 'late').length;
    const absent  = daily.filter(d => d.status === 'absent').length;
    const totalWorked = daily.reduce((a, d) => a + (d.worked_minutes || 0), 0);
    const totalLate   = daily.reduce((a, d) => a + (d.late_minutes   || 0), 0);

    // Promedio de hora de entrada (solo días con registro)
    const entries = daily.filter(d => d.first_in).map(d => {
      const t = new Date(d.first_in);
      return t.getHours() * 60 + t.getMinutes();
    });
    const avgEntryMinutes = entries.length ? Math.round(entries.reduce((a,b) => a+b, 0) / entries.length) : null;

    // Tendencia por semana (agrupar)
    const weeklyMap = {};
    for (const d of daily) {
      const dt  = new Date(d.date + 'T12:00');
      const mon = new Date(dt);
      mon.setDate(dt.getDate() - dt.getDay() + 1);
      const wk = mon.toISOString().split('T')[0];
      if (!weeklyMap[wk]) weeklyMap[wk] = { week: wk, worked: 0, late: 0, present: 0 };
      weeklyMap[wk].worked  += d.worked_minutes || 0;
      weeklyMap[wk].late    += d.late_minutes   || 0;
      if (['present','late'].includes(d.status)) weeklyMap[wk].present++;
    }
    const weekly = Object.values(weeklyMap).map(w => ({
      ...w,
      worked_hm: minsToHM(w.worked),
    }));

    // Conteo por día de semana
    const dayOfWeek = [0,0,0,0,0,0,0];
    const dayNames  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    for (const d of daily) {
      if (['present','late'].includes(d.status)) {
        dayOfWeek[new Date(d.date + 'T12:00').getDay()]++;
      }
    }
    const byDow = dayNames.map((name, i) => ({ name, present: dayOfWeek[i] }));

    res.json({
      period: { from, to, months: +months },
      summary: {
        present, late, absent,
        total_worked: minsToHM(totalWorked),
        total_late_minutes: totalLate,
        avg_entry: avgEntryMinutes ? `${Math.floor(avgEntryMinutes/60)}:${String(avgEntryMinutes%60).padStart(2,'0')}` : null,
        attendance_rate: daily.length ? Math.round(present / daily.length * 100) : 0,
      },
      weekly,
      byDayOfWeek: byDow,
      daily,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
