/**
 * notificationWebhooks.js
 * Envía notificaciones a Slack y/o Microsoft Teams via webhooks entrantes.
 *
 * Configuración (system_settings o .env):
 *   SLACK_WEBHOOK_URL   — https://hooks.slack.com/services/...
 *   TEAMS_WEBHOOK_URL   — https://xxx.webhook.office.com/...
 */
const https = require('https');
const { URL } = require('url');
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

// ── Helpers HTTP ───────────────────────────────────────────────

function httpsPost(url, payload, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout,
    };
    const req = https.request(opts, r => {
      let data = '';
      r.on('data', d => data += d);
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Leer webhooks desde system_settings o .env ────────────────

async function getWebhookUrls() {
  try {
    const [rows] = await sequelize.query(
      "SELECT key_name, value FROM system_settings WHERE key_name IN ('slack_webhook_url','teams_webhook_url')"
    );
    const map = {};
    for (const r of rows) map[r.key_name] = r.value;
    return {
      slack:  map.slack_webhook_url  || process.env.SLACK_WEBHOOK_URL  || null,
      teams:  map.teams_webhook_url  || process.env.TEAMS_WEBHOOK_URL  || null,
    };
  } catch {
    return {
      slack: process.env.SLACK_WEBHOOK_URL || null,
      teams: process.env.TEAMS_WEBHOOK_URL || null,
    };
  }
}

// ── Slack ──────────────────────────────────────────────────────

async function sendSlack(webhookUrl, { text, blocks, color = '#3b82f6' }) {
  const payload = blocks
    ? { blocks }
    : {
        attachments: [{
          color,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
        }],
      };
  return httpsPost(webhookUrl, payload);
}

// ── Teams ──────────────────────────────────────────────────────

async function sendTeams(webhookUrl, { title, text, color = '3B82F6', facts = [] }) {
  const payload = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    themeColor: color,
    summary: title,
    sections: [{
      activityTitle: title,
      activityText: text,
      facts,
    }],
  };
  return httpsPost(webhookUrl, payload);
}

// ── Dispatch genérico ──────────────────────────────────────────

/**
 * notify({ title, text, color?, facts? })
 * Envía a todos los canales configurados.
 */
async function notify({ title, text, color = '#3b82f6', facts = [] }) {
  const urls = await getWebhookUrls();
  const tasks = [];

  if (urls.slack) {
    tasks.push(
      sendSlack(urls.slack, { text: `*${title}*\n${text}`, color })
        .then(() => logger.info(`✅ Slack notificación enviada: ${title}`))
        .catch(e => logger.warn(`⚠️  Slack webhook error: ${e.message}`))
    );
  }
  if (urls.teams) {
    tasks.push(
      sendTeams(urls.teams, { title, text, color: color.replace('#', ''), facts })
        .then(() => logger.info(`✅ Teams notificación enviada: ${title}`))
        .catch(e => logger.warn(`⚠️  Teams webhook error: ${e.message}`))
    );
  }

  await Promise.allSettled(tasks);
}

// ── Notificaciones predefinidas ────────────────────────────────

async function notifyAbsences(employees) {
  if (!employees.length) return;
  const list = employees.slice(0, 10).map(e => `• ${e.full_name} (${e.department || ''})`).join('\n');
  const more = employees.length > 10 ? `\n_...y ${employees.length - 10} más_` : '';
  await notify({
    title: `🚨 ${employees.length} ausencia(s) hoy — ${new Date().toLocaleDateString('es-PY')}`,
    text: list + more,
    color: '#ef4444',
    facts: employees.slice(0, 5).map(e => ({ name: e.full_name, value: e.department || '' })),
  });
}

async function notifyLateArrivals(employees) {
  if (!employees.length) return;
  const list = employees.slice(0, 10).map(e => `• ${e.full_name} — ${e.late_minutes} min`).join('\n');
  const more = employees.length > 10 ? `\n_...y ${employees.length - 10} más_` : '';
  await notify({
    title: `⏰ ${employees.length} llegada(s) tarde hoy`,
    text: list + more,
    color: '#f59e0b',
    facts: employees.slice(0, 5).map(e => ({ name: e.full_name, value: `${e.late_minutes} min tarde` })),
  });
}

async function notifyPermissionPending(count) {
  if (!count) return;
  await notify({
    title: `📋 ${count} permiso(s) pendientes de aprobación`,
    text: 'Hay solicitudes de permiso esperando revisión en el sistema.',
    color: '#8b5cf6',
  });
}

async function notifyDeviceDown(deviceName, ip, downtimeMin) {
  await notify({
    title: `🔴 Reloj offline: ${deviceName}`,
    text: `El reloj biométrico *${deviceName}* (${ip}) lleva ${downtimeMin} minutos sin responder.`,
    color: '#ef4444',
    facts: [
      { name: 'Dispositivo', value: deviceName },
      { name: 'IP', value: ip },
      { name: 'Sin respuesta', value: `${downtimeMin} min` },
    ],
  });
}

async function notifyBackupOk(filename, sizeMb) {
  await notify({
    title: `✅ Backup completado`,
    text: `Archivo: \`${filename}\` — ${sizeMb} MB`,
    color: '#10b981',
  });
}

module.exports = {
  notify,
  notifyAbsences,
  notifyLateArrivals,
  notifyPermissionPending,
  notifyDeviceDown,
  notifyBackupOk,
  getWebhookUrls,
  sendSlack,
  sendTeams,
};
