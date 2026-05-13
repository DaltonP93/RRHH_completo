/**
 * worker-notifications — Procesador de cola de notificaciones
 *
 * Corre como proceso PM2 separado (cwd: api/).
 * Lee notification_queue en estado 'pending' y envía por cada canal:
 *   EMAIL → nodemailer/SMTP
 *   INTERNAL → inserta en internal_notifications
 *   WHATSAPP, TELEGRAM, SMS → HTTP a providers externos
 *   PUSH_WEB → web-push VAPID
 *   WEBHOOK → HTTP POST al endpoint configurado
 *
 * Variables de entorno:
 *   NOTIFICATION_WORKER_INTERVAL_MS = 10000 (poll cada 10s)
 *   NOTIFICATION_BATCH_SIZE         = 20
 */

require('dotenv').config();
process.env.SERVICE_NAME = 'worker-notifications';

const { sequelize } = require('./src/config/database');
const logger = require('./src/config/logger');

const INTERVAL_MS  = parseInt(process.env.NOTIFICATION_WORKER_INTERVAL_MS || '10000');
const BATCH_SIZE   = parseInt(process.env.NOTIFICATION_BATCH_SIZE || '20');
const MAX_RETRIES  = 3;

// ─── Senders ────────────────────────────────────────────────────

async function sendEmail(item) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_TLS === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transporter.sendMail({
    from:    process.env.SMTP_FROM || 'noreply@empresa.com',
    to:      item.recipient_address,
    subject: item.subject || '(sin asunto)',
    html:    item.body,
  });
  return { sent: true };
}

async function sendInternal(item) {
  await sequelize.query(`
    INSERT INTO internal_notifications
      (user_id, title, message, type, module, created_at)
    VALUES (?, ?, ?, 'info', 'sistema', NOW())
  `, { replacements: [item.recipient_user_id, item.subject || 'Notificación', item.body || ''] });
  return { sent: true };
}

async function sendWhatsapp(item) {
  const provider = process.env.WHATSAPP_PROVIDER || 'WAHA';
  if (provider === 'WAHA') {
    const apiUrl = process.env.WAHA_API_URL || 'http://localhost:3001';
    const session = process.env.WAHA_SESSION || 'default';
    const resp = await fetch(`${apiUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session,
        chatId: `${item.recipient_address}@c.us`,
        text: item.body,
      }),
    });
    if (!resp.ok) throw new Error(`WAHA error: ${resp.status}`);
    return { sent: true, provider: 'WAHA' };
  }
  throw new Error(`Proveedor WhatsApp no soportado: ${provider}`);
}

async function sendTelegram(item) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado');
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: item.recipient_address, text: item.body, parse_mode: 'HTML' }),
  });
  if (!resp.ok) throw new Error(`Telegram error: ${resp.status}`);
  return { sent: true };
}

async function sendSms(item) {
  const apiUrl = process.env.SMS_API_URL;
  if (!apiUrl) throw new Error('SMS_API_URL no configurado');
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.SMS_API_KEY || '' },
    body: JSON.stringify({ to: item.recipient_address, message: item.body }),
  });
  if (!resp.ok) throw new Error(`SMS error: ${resp.status}`);
  return { sent: true };
}

async function sendPushWeb(item) {
  const webpush = require('web-push');
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email      = process.env.VAPID_EMAIL;
  if (!publicKey || !privateKey) throw new Error('VAPID keys no configuradas');
  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
  const sub = JSON.parse(item.recipient_address);
  await webpush.sendNotification(sub, JSON.stringify({ title: item.subject, body: item.body }));
  return { sent: true };
}

async function sendWebhook(item) {
  const cfg = item.channel_config ? JSON.parse(item.channel_config) : {};
  const url = cfg.url;
  if (!url) throw new Error('Webhook URL no configurado');
  const method = cfg.method || 'POST';
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.secret) headers['X-Webhook-Secret'] = cfg.secret;
  const resp = await fetch(url, {
    method,
    headers,
    body: JSON.stringify({ subject: item.subject, body: item.body, event: item.event_code }),
  });
  if (!resp.ok) throw new Error(`Webhook error: ${resp.status}`);
  return { sent: true };
}

const SENDERS = {
  EMAIL:     sendEmail,
  INTERNAL:  sendInternal,
  WHATSAPP:  sendWhatsapp,
  TELEGRAM:  sendTelegram,
  SMS:       sendSms,
  PUSH_WEB:  sendPushWeb,
  WEBHOOK:   sendWebhook,
};

// ─── Procesar un ítem de la cola ─────────────────────────────────
async function processItem(item) {
  const sender = SENDERS[item.channel_code];
  if (!sender) {
    await sequelize.query(
      "UPDATE notification_queue SET status='failed', error_message=?, attempts=attempts+1 WHERE id=?",
      { replacements: [`Canal no soportado: ${item.channel_code}`, item.id] }
    );
    return;
  }

  try {
    const result = await sender(item);

    // Marcar como enviado
    await sequelize.query(
      "UPDATE notification_queue SET status='sent', sent_at=NOW(), attempts=attempts+1 WHERE id=?",
      { replacements: [item.id] }
    );

    // Log de entrega
    await sequelize.query(`
      INSERT INTO notification_delivery_logs
        (queue_id, channel_code, recipient_address, status, provider, response_payload, http_status, created_at)
      VALUES (?, ?, ?, 'sent', ?, ?, 200, NOW())
    `, { replacements: [
      item.id, item.channel_code, item.recipient_address,
      item.channel_code.toLowerCase(),
      JSON.stringify(result).slice(0, 500)
    ]});

    logger.info(`Notificación enviada: id=${item.id} canal=${item.channel_code} dest=${item.recipient_address}`);
  } catch (err) {
    const attempts = (item.attempts || 0) + 1;
    const newStatus = attempts >= MAX_RETRIES ? 'failed' : 'pending';
    const retryAt = attempts < MAX_RETRIES
      ? new Date(Date.now() + Math.pow(2, attempts) * 60000).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    await sequelize.query(`
      UPDATE notification_queue
      SET status=?, error_message=?, attempts=?, scheduled_at=COALESCE(?, scheduled_at)
      WHERE id=?
    `, { replacements: [newStatus, err.message.slice(0, 500), attempts, retryAt, item.id] });

    await sequelize.query(`
      INSERT INTO notification_delivery_logs
        (queue_id, channel_code, recipient_address, status, provider, response_payload, http_status, created_at)
      VALUES (?, ?, ?, 'failed', ?, ?, 0, NOW())
    `, { replacements: [
      item.id, item.channel_code, item.recipient_address || '',
      item.channel_code.toLowerCase(), err.message.slice(0, 500)
    ]});

    logger.warn(`Notificación fallida: id=${item.id} canal=${item.channel_code} intento=${attempts}/${MAX_RETRIES}: ${err.message}`);
  }
}

// ─── Poll de la cola ─────────────────────────────────────────────
async function processBatch() {
  try {
    const [items] = await sequelize.query(`
      SELECT q.*, ec.code AS event_code, ch.config_json AS channel_config
      FROM notification_queue q
      LEFT JOIN notification_event_catalog ec ON ec.id = q.event_id
      LEFT JOIN notification_channels ch ON ch.code = q.channel_code
      WHERE q.status = 'pending'
        AND (q.scheduled_at IS NULL OR q.scheduled_at <= NOW())
      ORDER BY q.priority DESC, q.created_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `);

    if (items.length > 0) {
      logger.info(`Procesando ${items.length} notificaciones pendientes`);
      for (const item of items) {
        // Marcar como 'processing' para evitar doble proceso
        await sequelize.query(
          "UPDATE notification_queue SET status='processing' WHERE id=? AND status='pending'",
          { replacements: [item.id] }
        );
        await processItem(item);
      }
    }
  } catch (err) {
    logger.error('Error en batch de notificaciones: ' + err.message);
  }
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  logger.info('worker-notifications iniciado');
  await sequelize.authenticate();
  logger.info(`Poll cada ${INTERVAL_MS / 1000}s — batch size: ${BATCH_SIZE}`);

  // Primera ejecución inmediata
  await processBatch();

  setInterval(processBatch, INTERVAL_MS);
}

main().catch(err => {
  logger.error('worker-notifications error fatal: ' + err.message);
  process.exit(1);
});
