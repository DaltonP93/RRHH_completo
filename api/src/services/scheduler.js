/**
 * scheduler.js
 * Gestión de reportes automáticos programados con node-cron.
 * Los schedules se guardan en la tabla report_schedules de MySQL.
 */

const cron = require('node-cron');
const { sequelize } = require('../config/database');
const { sendMail, buildReportEmailHtml } = require('./emailService');
const logger = require('../config/logger');

const _jobs = new Map(); // scheduleId → tarea cron activa

// ─── Generar reporte de marcadas (igual al PDF de SisHoras) ───────
async function generateMarcadasReport({ dateFrom, dateTo, employeeId, deptId } = {}) {
  const today = new Date().toISOString().split('T')[0];
  const from  = dateFrom || today;
  const to    = dateTo   || today;

  let empFilter = 'WHERE e.status = "active"';
  const params  = [from, to];
  if (employeeId) { empFilter += ' AND e.id = ?'; params.push(employeeId); }
  if (deptId)     { empFilter += ' AND e.department_id = ?'; params.push(deptId); }

  // Obtener todos los logs del período
  const [logs] = await sequelize.query(`
    SELECT
      e.id AS employee_id,
      CONCAT(e.first_name,' ',e.last_name) AS employee_name,
      e.code,
      d.name AS department,
      al.timestamp, al.type
    FROM attendance_logs al
    JOIN employees e ON al.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    ${empFilter.replace('WHERE e.status = "active"', 'WHERE e.status = "active"')}
      AND DATE(al.timestamp) BETWEEN ? AND ?
    ORDER BY e.last_name, al.timestamp
  `, { replacements: params });

  // Agrupar por empleado y fecha (fecha "laboral": marcas 00:00-04:59 se asignan al día anterior)
  const byEmp = {};
  const SHIFT_CUTOFF_HOUR = 5; // marcas antes de las 05:00 pertenecen al turno del día anterior
  for (const log of logs) {
    if (!byEmp[log.employee_id]) {
      byEmp[log.employee_id] = {
        employee_id: log.employee_id,
        employee_name: log.employee_name,
        code: log.code,
        department: log.department,
        days: {},
      };
    }
    const ts = new Date(log.timestamp);
    const workDate = new Date(ts);
    if (ts.getHours() < SHIFT_CUTOFF_HOUR) {
      workDate.setDate(workDate.getDate() - 1);
    }
    const date = workDate.toISOString().split('T')[0];
    if (!byEmp[log.employee_id].days[date]) {
      byEmp[log.employee_id].days[date] = [];
    }
    byEmp[log.employee_id].days[date].push(ts);
  }

  // Construir filas tipo "Marcadas" — pares entrada/salida
  const result = [];
  const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MONTH_NAMES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  for (const empData of Object.values(byEmp)) {
    const rows = [];
    let totalMinutes = 0;

    for (const [dateStr, marks] of Object.entries(empData.days).sort()) {
      const d = new Date(dateStr + 'T12:00');
      const dayName = DAY_NAMES[d.getDay()];
      const formatted = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

      // Ordenar marcas y deduplicar las que caen dentro del mismo minuto
      // (algunos relojes registran el mismo fichaje 2 veces por segundo)
      marks.sort((a, b) => a - b);
      const deduped = [];
      for (const m of marks) {
        const last = deduped[deduped.length - 1];
        if (!last || Math.abs(m - last) > 60 * 1000) deduped.push(m);
      }

      // Emparejar (par = entrada, impar = salida) y sumar sólo pares completos.
      // Así se excluye el tiempo de almuerzo entre pares (in/out/in/out).
      // Si el día queda con un marcaje impar sin par, se ignora la última entrada.
      const pairs = [];
      let dayMinutes = 0;
      for (let i = 0; i < deduped.length; i += 2) {
        const entrada = deduped[i];
        const salida  = deduped[i + 1];
        pairs.push({
          entrada: entrada ? fmtTime(entrada) : '',
          salida:  salida  ? fmtTime(salida)  : '',
        });
        if (entrada && salida && salida > entrada) {
          dayMinutes += Math.round((salida - entrada) / 60000);
        }
      }
      totalMinutes += dayMinutes;

      rows.push({
        dayName,
        date: formatted,
        pairs,          // array de {entrada, salida}
        total: dayMinutes > 0 ? minsToHM(dayMinutes) : '0:00',
      });
    }

    result.push({
      ...empData,
      rows,
      total_minutes: totalMinutes,
      total_hm: minsToHM(totalMinutes),
    });
  }

  return { data: result, period: { from, to } };
}

function fmtTime(dt) {
  if (!dt) return '';
  const h = dt.getHours();
  const m = dt.getMinutes();
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function minsToHM(mins) {
  if (!mins || mins <= 0) return '0:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2,'0')}`;
}

// ─── Construir tabla HTML del reporte marcadas ────────────────────
function buildMarcadasTableHtml(empData) {
  const maxPairs = Math.max(...empData.rows.map(r => r.pairs.length), 1);

  let headers = '<th>Fecha</th>';
  for (let i = 0; i < maxPairs; i++) {
    headers += `<th>Entrada</th><th>Salida</th>`;
  }
  headers += '<th>Total Permanencia</th>';

  const tbody = empData.rows.map(row => {
    let cells = `<td><strong>${row.dayName}</strong> ${row.date}</td>`;
    for (let i = 0; i < maxPairs; i++) {
      const p = row.pairs[i] || { entrada: '', salida: '' };
      cells += `<td>${p.entrada}</td><td>${p.salida}</td>`;
    }
    const totalClass = row.total === '0:00' ? 'zero' : 'total';
    cells += `<td class="${totalClass}">${row.total}</td>`;
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<table><thead><tr>${headers}</tr></thead><tbody>${tbody}</tbody></table>`;
}

// ─── Cargar y ejecutar todos los schedules activos ────────────────
async function loadSchedules() {
  try {
    const [schedules] = await sequelize.query(
      'SELECT * FROM report_schedules WHERE active = 1'
    );
    for (const s of schedules) {
      registerJob(s);
    }
    logger.info(`Scheduler: ${schedules.length} reporte(s) programados cargados`);
  } catch (err) {
    logger.warn('report_schedules tabla no disponible aún:', err.message);
  }
}

// Registrar un job cron
function registerJob(schedule) {
  // Limpiar job previo si existe
  if (_jobs.has(schedule.id)) {
    _jobs.get(schedule.id).stop();
    _jobs.delete(schedule.id);
  }

  if (!cron.validate(schedule.cron_expression)) {
    logger.warn(`Expresión cron inválida para schedule ${schedule.id}: ${schedule.cron_expression}`);
    return;
  }

  const task = cron.schedule(schedule.cron_expression, async () => {
    logger.info(`Ejecutando reporte programado #${schedule.id}: ${schedule.name}`);
    await runScheduledReport(schedule);
  }, { timezone: schedule.timezone || 'America/Mexico_City' });

  _jobs.set(schedule.id, task);
}

// Ejecutar un reporte y enviarlo por email
async function runScheduledReport(schedule) {
  try {
    const config = JSON.parse(schedule.config || '{}');

    // Calcular período según el tipo
    const now = new Date();
    let dateFrom, dateTo;
    if (schedule.period_type === 'daily') {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      dateFrom = dateTo = d.toISOString().split('T')[0];
    } else if (schedule.period_type === 'weekly') {
      const to = new Date(now); to.setDate(to.getDate() - 1);
      const from = new Date(to); from.setDate(from.getDate() - 6);
      dateFrom = from.toISOString().split('T')[0];
      dateTo   = to.toISOString().split('T')[0];
    } else {
      // monthly
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = now.getMonth() === 0 ? 12 : now.getMonth();
      dateFrom = `${y}-${String(m).padStart(2,'0')}-01`;
      dateTo   = new Date(y, m, 0).toISOString().split('T')[0];
    }

    const report = await generateMarcadasReport({
      dateFrom, dateTo,
      employeeId: config.employeeId,
      deptId: config.deptId,
    });

    // Construir HTML del email
    const tableHtmlParts = report.data.map(emp => `
      <h3>${emp.employee_name} [${emp.code}] — ${emp.department || ''}</h3>
      ${buildMarcadasTableHtml(emp)}
      <p style="text-align:right;font-weight:bold;color:#1e40af">Total período: ${emp.total_hm}</p>
      <hr>
    `).join('');

    const html = buildReportEmailHtml({
      title: schedule.name,
      period: `${dateFrom} al ${dateTo}`,
      tableHtml: tableHtmlParts || '<p>Sin registros en este período</p>',
    });

    // Enviar a los destinatarios configurados
    const recipients = schedule.recipients ? schedule.recipients.split(',').map(e => e.trim()) : [];
    if (recipients.length > 0) {
      await sendMail({ to: recipients, subject: `${schedule.name} — ${dateFrom}`, html });
    }

    // Actualizar último envío
    await sequelize.query(
      'UPDATE report_schedules SET last_run = NOW() WHERE id = ?',
      { replacements: [schedule.id] }
    );

  } catch (err) {
    logger.error(`Error en reporte programado #${schedule.id}:`, err);
  }
}

// Detener un job
function stopJob(scheduleId) {
  if (_jobs.has(scheduleId)) {
    _jobs.get(scheduleId).stop();
    _jobs.delete(scheduleId);
  }
}

// ─── Cron respaldo: pull att2000 → MySQL ─────────────────────────
// Activar con ATT2000_PULL_CRON="*/10 * * * *" (sintaxis node-cron)
let _att2000PullJob = null;
function startAtt2000PullCron() {
  const expr = process.env.ATT2000_PULL_CRON;
  if (!expr) return;
  if (_att2000PullJob) _att2000PullJob.stop();

  try {
    const { syncAttendance } = require('../config/zkAdapter');
    _att2000PullJob = cron.schedule(expr, async () => {
      try {
        const dateFrom = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0,10);
        const result = await syncAttendance({ dateFrom, limit: 5000 });
        logger.info(`⏱️  Cron att2000 pull: ${JSON.stringify(result)}`);
      } catch (err) {
        logger.error('Error en cron att2000 pull:', err.message);
      }
    });
    logger.info(`📅 Cron respaldo att2000 → MySQL activo: ${expr}`);
  } catch (err) {
    logger.error('No se pudo registrar ATT2000_PULL_CRON:', err.message);
  }
}

// ─── Cron alertas diarias de atrasos/ausencias ───────────────────
let _lateJob = null;
let _absentJob = null;
function startDailyAlertsCron() {
  try {
    const { sendDailyLateAlerts, sendDailyAbsenceAlerts } = require('./notifications');
    const lateExpr   = process.env.DAILY_LATE_CRON   || '30 9 * * 1-6';
    const absentExpr = process.env.DAILY_ABSENT_CRON || '0 10 * * 1-6';
    const tz         = process.env.CRON_TZ || 'America/Asuncion';

    if (_lateJob) _lateJob.stop();
    if (cron.validate(lateExpr)) {
      _lateJob = cron.schedule(lateExpr, async () => {
        const r = await sendDailyLateAlerts();
        logger.info(`📧 Alertas atrasos: ${JSON.stringify(r)}`);
        // Webhook Slack/Teams
        try {
          const wh = require('./notificationWebhooks');
          const [rows] = await require('../config/database').sequelize.query(
            `SELECT ds.late_minutes, e.full_name, d.name AS department
             FROM daily_summary ds
             JOIN employees e ON e.id = ds.employee_id
             LEFT JOIN departments d ON d.id = e.department_id
             WHERE ds.date = CURDATE() AND ds.status = 'late' AND ds.late_minutes > 0
             ORDER BY ds.late_minutes DESC LIMIT 20`
          );
          if (rows.length) await wh.notifyLateArrivals(rows).catch(() => {});
        } catch {}
      }, { timezone: tz });
      logger.info(`📅 Cron alertas atrasos activo: ${lateExpr} (${tz})`);
    }

    if (_absentJob) _absentJob.stop();
    if (cron.validate(absentExpr)) {
      _absentJob = cron.schedule(absentExpr, async () => {
        const r = await sendDailyAbsenceAlerts();
        logger.info(`📧 Alertas ausencias: ${JSON.stringify(r)}`);
        // Webhook Slack/Teams
        try {
          const wh = require('./notificationWebhooks');
          const [rows] = await require('../config/database').sequelize.query(
            `SELECT e.full_name, d.name AS department
             FROM daily_summary ds
             JOIN employees e ON e.id = ds.employee_id
             LEFT JOIN departments d ON d.id = e.department_id
             WHERE ds.date = CURDATE() AND ds.status = 'absent'
             ORDER BY e.full_name LIMIT 20`
          );
          if (rows.length) await wh.notifyAbsences(rows).catch(() => {});
        } catch {}
      }, { timezone: tz });
      logger.info(`📅 Cron alertas ausencias activo: ${absentExpr} (${tz})`);
    }
  } catch (err) {
    logger.error('No se pudieron registrar crons de alertas:', err.message);
  }
}

// ─── Cron diario: vencimiento de capacitaciones ──────────────────
let _coursesCron = null;
function startCoursesDueCron() {
  const expr = process.env.COURSES_DUE_CRON || '0 8 * * 1-6'; // cada día hábil a las 8am
  const tz   = process.env.CRON_TZ || 'America/Asuncion';
  try {
    if (_coursesCron) _coursesCron.stop();
    if (!cron.validate(expr)) return;
    _coursesCron = cron.schedule(expr, async () => {
      try {
        // Buscar asignaciones de cursos vencidas o a punto de vencer (próximos 3 días)
        const [rows] = await sequelize.query(`
          SELECT
            ca.id AS assignment_id,
            ca.employee_id,
            CONCAT(e.first_name,' ',e.last_name) AS employee_name,
            u.email AS employee_email,
            c.title AS course_title,
            ca.due_date,
            DATEDIFF(ca.due_date, CURDATE()) AS days_left
          FROM course_assignments ca
          JOIN courses c ON c.id = ca.course_id
          JOIN employees e ON e.id = ca.employee_id
          LEFT JOIN users u ON u.employee_id = e.id AND u.active = 1
          WHERE ca.status NOT IN ('completed','cancelled')
            AND ca.due_date IS NOT NULL
            AND DATEDIFF(ca.due_date, CURDATE()) BETWEEN -1 AND 3
            AND u.email IS NOT NULL AND u.email != ''
          ORDER BY ca.due_date ASC
          LIMIT 200
        `);

        let sent = 0;
        for (const r of rows) {
          const overdue = r.days_left < 0;
          const subject = overdue
            ? `⚠️ Capacitación vencida: ${r.course_title}`
            : `📚 Recordatorio capacitación: ${r.course_title} (${r.days_left === 0 ? 'vence hoy' : `${r.days_left} día${r.days_left > 1 ? 's' : ''}`})`;
          await sendMail({
            to: r.employee_email,
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px">
              <h2 style="color:${overdue ? '#dc2626' : '#d97706'}">${subject}</h2>
              <p>Hola <strong>${r.employee_name}</strong>,</p>
              <p>${overdue
                ? `La capacitación <strong>${r.course_title}</strong> venció el <strong>${r.due_date}</strong>. Por favor completala lo antes posible.`
                : `La capacitación <strong>${r.course_title}</strong> vence el <strong>${r.due_date}</strong>. Ingresá al portal para completarla.`
              }</p>
              <p style="color:#9ca3af;font-size:12px">Sistema de Asistencia — Notificación automática</p>
            </div>`,
          }).catch(() => {});
          sent++;
        }
        if (sent) logger.info(`📚 Cron cursos: ${sent} recordatorio(s) enviado(s)`);
      } catch (err) {
        logger.error('Error cron courses due:', err.message);
      }
    }, { timezone: tz });
    logger.info(`📅 Cron vencimiento capacitaciones activo: ${expr} (${tz})`);
  } catch (err) {
    logger.error('No se pudo registrar cron de capacitaciones:', err.message);
  }
}

module.exports = {
  loadSchedules,
  registerJob,
  stopJob,
  generateMarcadasReport,
  buildMarcadasTableHtml,
  minsToHM,
  fmtTime,
  startAtt2000PullCron,
  startDailyAlertsCron,
  startCoursesDueCron,
};
