/**
 * emailService.js
 * Servicio de envío de correos usando Nodemailer.
 * La configuración SMTP se guarda en la tabla notification_settings.
 */

const nodemailer = require('nodemailer');
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

let _transporter = null;
let _config = null;

// Cargar config SMTP desde DB (o .env como fallback)
async function loadSmtpConfig() {
  try {
    const [rows] = await sequelize.query(
      "SELECT setting_value FROM notification_settings WHERE setting_key = 'smtp_config' LIMIT 1"
    );
    if (rows.length && rows[0].setting_value) {
      return JSON.parse(rows[0].setting_value);
    }
  } catch {}
  // Fallback desde variables de entorno
  if (process.env.SMTP_HOST) {
    return {
      host:     process.env.SMTP_HOST,
      port:     parseInt(process.env.SMTP_PORT || '587'),
      secure:   process.env.SMTP_SECURE === 'true',
      auth:     { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      from:     process.env.SMTP_FROM || process.env.SMTP_USER,
    };
  }
  return null;
}

async function getTransporter() {
  const config = await loadSmtpConfig();
  if (!config) return null;

  // Reusar si la config no cambió
  if (_transporter && JSON.stringify(config) === JSON.stringify(_config)) {
    return _transporter;
  }

  _config = config;
  const port   = +config.port;
  // puerto 465 → SSL directo (secure:true)
  // puerto 587 / 25 / 2525 → STARTTLS (secure:false, requireTLS para 587)
  const secure = config.secure ?? (port === 465);

  _transporter = nodemailer.createTransport({
    host:       config.host,
    port,
    secure,
    auth:       { user: config.auth.user, pass: config.auth.pass },
    requireTLS: port === 587,   // forzar STARTTLS en puerto 587
    tls: {
      rejectUnauthorized: false,   // aceptar certs autofirmados (webmail interno)
      minVersion: 'TLSv1',         // compatibilidad con servidores legacy
    },
  });

  return _transporter;
}

// Invalidar transporter (cuando se actualiza la config)
function resetTransporter() {
  _transporter = null;
  _config = null;
}

/**
 * Enviar correo
 * @param {object} opts - { to, subject, html, text, attachments }
 */
async function sendMail({ to, subject, html, text, attachments = [] }) {
  const transporter = await getTransporter();
  if (!transporter) {
    logger.warn('Email no configurado — no se envió:', subject);
    return { sent: false, reason: 'SMTP no configurado' };
  }

  const config = await loadSmtpConfig();
  try {
    const info = await transporter.sendMail({
      from: config.from || config.auth.user,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text,
      attachments,
    });
    logger.info(`Email enviado: ${subject} → ${to} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Error enviando email:', err.message);
    return { sent: false, reason: err.message };
  }
}

// ─── Templates ────────────────────────────────────────────────────

function buildReportEmailHtml({ title, period, employeeName, tableHtml, totalHours }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #333; background: #f8fafc; margin:0; padding:20px; }
  .card { background: white; border-radius: 12px; padding: 24px; max-width: 800px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  h1 { color: #1e40af; margin-bottom: 4px; font-size: 22px; }
  .period { color: #6b7280; font-size: 14px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f1f5f9; padding: 8px 10px; text-align: left; color: #475569; font-weight: 600; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  .total { font-weight: 700; color: #1e40af; }
  .zero  { color: #ef4444; }
  .footer { margin-top: 20px; font-size: 12px; color: #94a3b8; text-align: center; }
</style></head>
<body>
<div class="card">
  <h1>${title}</h1>
  <p class="period">${period}${employeeName ? ' &nbsp;|&nbsp; ' + employeeName : ''}</p>
  ${tableHtml}
  ${totalHours ? `<p class="total" style="text-align:right;margin-top:12px;">Total: ${totalHours}</p>` : ''}
  <p class="footer">Generado automáticamente por Sistema de Asistencia — RH</p>
</div>
</body></html>`;
}

function buildAlertHtml({ type, employeeName, message, timestamp }) {
  const colors = {
    late:    '#f59e0b',
    absent:  '#ef4444',
    device:  '#8b5cf6',
  };
  const color = colors[type] || '#3b82f6';
  return `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px">
<div style="background:white;border-radius:12px;padding:24px;max-width:500px;margin:0 auto;border-left:5px solid ${color}">
  <h2 style="color:${color};margin-top:0">⚠️ Alerta de Asistencia</h2>
  <p><strong>Empleado:</strong> ${employeeName}</p>
  <p><strong>Mensaje:</strong> ${message}</p>
  <p><strong>Hora:</strong> ${timestamp}</p>
  <p style="font-size:12px;color:#94a3b8;margin-top:16px">Sistema de Asistencia — RH</p>
</div>
</body></html>`;
}

module.exports = { sendMail, resetTransporter, buildReportEmailHtml, buildAlertHtml };
