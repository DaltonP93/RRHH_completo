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

  // Agrupar por empleado y fecha
  const byEmp = {};
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
    const date = new Date(log.timestamp).toISOString().split('T')[0];
    if (!byEmp[log.employee_id].days[date]) {
      byEmp[log.employee_id].days[date] = [];
    }
    byEmp[log.employee_id].days[date].push(new Date(log.timestamp));
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

      // Ordenar marcas
      marks.sort((a, b) => a - b);

      // Emparejar (par = entrada, impar = salida)
      const pairs = [];
      for (let i = 0; i < marks.length; i += 2) {
        pairs.push({
          entrada: marks[i]   ? fmtTime(marks[i])   : '',
          salida:  marks[i+1] ? fmtTime(marks[i+1]) : '',
        });
      }

      // Total del día (primer entrada → última salida)
      let dayMinutes = 0;
      if (marks.length >= 2) {
        const first = marks[0];
        const last  = marks[marks.length - 1];
        // Solo si hay al menos 1 par completo
        if (marks.length % 2 === 0) {
          dayMinutes = Math.round((last - first) / 60000);
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

module.exports = {
  loadSchedules,
  registerJob,
  stopJob,
  generateMarcadasReport,
  buildMarcadasTableHtml,
  minsToHM,
  fmtTime,
};
