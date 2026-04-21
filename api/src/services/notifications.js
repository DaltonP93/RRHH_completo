/**
 * notifications.js
 * Envío de notificaciones email automáticas para eventos del sistema:
 *  - Cambios de estado de permisos (creado / aprobado / rechazado / cancelado)
 *  - Alertas diarias de atrasos y ausencias
 *
 * Todas las funciones son "best effort": registran el resultado y nunca
 * interrumpen el flujo principal si el SMTP falla.
 */

const { sequelize } = require('../config/database');
const logger = require('../config/logger');
const { sendMail, buildAlertHtml } = require('./emailService');

// ─── Helpers ─────────────────────────────────────────────────────
async function getPermissionContext(permissionId) {
  const [[row]] = await sequelize.query(`
    SELECT p.*,
      CONCAT(e.first_name,' ',e.last_name) AS employee_name,
      e.code AS employee_code,
      e.email AS employee_email,
      e.department_id,
      d.name AS department_name,
      d.coordinator_id, d.manager_id,
      uc.email AS coord_email, uc.full_name AS coord_name,
      um.email AS mgr_email,   um.full_name AS mgr_name
    FROM permissions p
    JOIN employees e ON p.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN users uc ON d.coordinator_id = uc.id
    LEFT JOIN users um ON d.manager_id = um.id
    WHERE p.id = ? LIMIT 1
  `, { replacements: [permissionId] });
  return row || null;
}

async function getGthEmails() {
  try {
    const [rows] = await sequelize.query(
      "SELECT email FROM users WHERE role IN ('admin','gth') AND email IS NOT NULL AND active = 1"
    );
    return rows.map(r => r.email).filter(Boolean);
  } catch { return []; }
}

function fmtDate(d) {
  if (!d) return '';
  const s = typeof d === 'string' ? d : new Date(d).toISOString();
  return s.slice(0, 10);
}

function buildPermissionEmailHtml({ title, color, perm, note, footer }) {
  return `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px">
<div style="background:white;border-radius:12px;padding:24px;max-width:560px;margin:0 auto;border-left:5px solid ${color}">
  <h2 style="color:${color};margin-top:0">${title}</h2>
  <p><strong>Empleado:</strong> ${perm.employee_name} [${perm.employee_code || ''}]</p>
  <p><strong>Departamento:</strong> ${perm.department_name || '—'}</p>
  <p><strong>Tipo:</strong> ${perm.type || '—'}</p>
  <p><strong>Período:</strong> ${fmtDate(perm.date_from)} → ${fmtDate(perm.date_to)}</p>
  ${perm.reason ? `<p><strong>Motivo:</strong> ${perm.reason}</p>` : ''}
  ${note ? `<p><strong>Nota:</strong> ${note}</p>` : ''}
  <p style="font-size:12px;color:#94a3b8;margin-top:16px">${footer || 'Sistema de Asistencia — RH'}</p>
</div>
</body></html>`;
}

// ─── Eventos de permisos ─────────────────────────────────────────
async function notifyPermissionCreated(permissionId) {
  try {
    const perm = await getPermissionContext(permissionId);
    if (!perm) return;

    // Próximo aprobador según needs
    const recipients = [];
    if (perm.needs_level1 && perm.coord_email) recipients.push(perm.coord_email);
    else if (perm.needs_level2 && perm.mgr_email) recipients.push(perm.mgr_email);
    else recipients.push(...(await getGthEmails()));

    if (!recipients.length) return;
    await sendMail({
      to: recipients,
      subject: `Nueva solicitud de permiso — ${perm.employee_name}`,
      html: buildPermissionEmailHtml({
        title: '📋 Nueva solicitud de permiso',
        color: '#3b82f6',
        perm,
        footer: 'Requiere tu aprobación en el sistema',
      }),
    });
  } catch (err) {
    logger.warn('notifyPermissionCreated:', err.message);
  }
}

async function notifyPermissionAdvanced(permissionId, fromState, toState, note) {
  try {
    const perm = await getPermissionContext(permissionId);
    if (!perm) return;

    // Avisar al siguiente aprobador si corresponde
    const recipients = [];
    if (toState === 'level1_ok' && perm.needs_level2 && perm.mgr_email) {
      recipients.push(perm.mgr_email);
    } else if (toState === 'level2_ok' && perm.needs_final) {
      recipients.push(...(await getGthEmails()));
    } else if (toState === 'approved') {
      if (perm.employee_email) recipients.push(perm.employee_email);
    }

    if (!recipients.length) return;

    const isApproved = toState === 'approved';
    await sendMail({
      to: recipients,
      subject: isApproved
        ? `✅ Permiso aprobado — ${perm.employee_name}`
        : `Permiso avanzó de nivel — ${perm.employee_name}`,
      html: buildPermissionEmailHtml({
        title: isApproved ? '✅ Permiso aprobado' : '➡️ Permiso requiere tu aprobación',
        color: isApproved ? '#10b981' : '#3b82f6',
        perm,
        note,
      }),
    });
  } catch (err) {
    logger.warn('notifyPermissionAdvanced:', err.message);
  }
}

async function notifyPermissionRejected(permissionId, reason) {
  try {
    const perm = await getPermissionContext(permissionId);
    if (!perm || !perm.employee_email) return;

    await sendMail({
      to: perm.employee_email,
      subject: `❌ Permiso rechazado — ${fmtDate(perm.date_from)}`,
      html: buildPermissionEmailHtml({
        title: '❌ Solicitud de permiso rechazada',
        color: '#ef4444',
        perm,
        note: reason || 'Sin motivo indicado',
      }),
    });
  } catch (err) {
    logger.warn('notifyPermissionRejected:', err.message);
  }
}

// ─── Alertas diarias ─────────────────────────────────────────────
/**
 * Atrasos > 15 min del día de hoy.
 * Envía un email consolidado a los destinatarios de alertas.
 */
async function sendDailyLateAlerts() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await sequelize.query(`
      SELECT ds.employee_id, ds.late_minutes, ds.first_in,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        e.code, d.name AS department,
        um.email AS mgr_email
      FROM daily_summary ds
      JOIN employees e ON ds.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users um ON d.manager_id = um.id
      WHERE ds.date = ? AND ds.late_minutes > 15
        AND e.status = 'active'
    `, { replacements: [today] });

    if (!rows.length) return { sent: 0 };

    // Agrupar por manager para que cada uno reciba solo su equipo
    const byMgr = new Map();
    for (const r of rows) {
      const to = r.mgr_email || null;
      if (!to) continue;
      if (!byMgr.has(to)) byMgr.set(to, []);
      byMgr.get(to).push(r);
    }

    // Además enviar resumen global a GTH
    const gthEmails = await getGthEmails();
    if (gthEmails.length) byMgr.set(gthEmails.join(','), rows);

    for (const [to, items] of byMgr) {
      const listHtml = items.map(r =>
        `<li><strong>${r.employee_name}</strong> [${r.code}] — ${r.department || ''}: ${r.late_minutes} min (entrada ${r.first_in ? String(r.first_in).slice(11, 16) : '—'})</li>`
      ).join('');
      await sendMail({
        to: to.includes(',') ? to.split(',') : to,
        subject: `⏰ Atrasos del día ${today} (${items.length})`,
        html: buildAlertHtml({
          type: 'late',
          employeeName: `${items.length} empleado(s)`,
          message: `<ul style="margin:6px 0 0 0;padding-left:20px">${listHtml}</ul>`,
          timestamp: today,
        }),
      });
    }
    return { sent: byMgr.size };
  } catch (err) {
    logger.error('sendDailyLateAlerts:', err.message);
    return { sent: 0, error: err.message };
  }
}

/**
 * Ausencias del día (status='absent'), excluyendo feriado/fin de semana/permiso.
 */
async function sendDailyAbsenceAlerts() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await sequelize.query(`
      SELECT ds.employee_id,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        e.code, d.name AS department,
        um.email AS mgr_email
      FROM daily_summary ds
      JOIN employees e ON ds.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users um ON d.manager_id = um.id
      WHERE ds.date = ? AND ds.status = 'absent' AND e.status = 'active'
    `, { replacements: [today] });

    if (!rows.length) return { sent: 0 };

    const byMgr = new Map();
    for (const r of rows) {
      const to = r.mgr_email || null;
      if (!to) continue;
      if (!byMgr.has(to)) byMgr.set(to, []);
      byMgr.get(to).push(r);
    }

    const gthEmails = await getGthEmails();
    if (gthEmails.length) byMgr.set(gthEmails.join(','), rows);

    for (const [to, items] of byMgr) {
      const listHtml = items.map(r =>
        `<li><strong>${r.employee_name}</strong> [${r.code}] — ${r.department || ''}</li>`
      ).join('');
      await sendMail({
        to: to.includes(',') ? to.split(',') : to,
        subject: `🚨 Ausencias del día ${today} (${items.length})`,
        html: buildAlertHtml({
          type: 'absent',
          employeeName: `${items.length} empleado(s)`,
          message: `<ul style="margin:6px 0 0 0;padding-left:20px">${listHtml}</ul>`,
          timestamp: today,
        }),
      });
    }
    return { sent: byMgr.size };
  } catch (err) {
    logger.error('sendDailyAbsenceAlerts:', err.message);
    return { sent: 0, error: err.message };
  }
}

module.exports = {
  notifyPermissionCreated,
  notifyPermissionAdvanced,
  notifyPermissionRejected,
  sendDailyLateAlerts,
  sendDailyAbsenceAlerts,
};
