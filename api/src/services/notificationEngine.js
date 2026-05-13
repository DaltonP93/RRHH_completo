'use strict';
/**
 * notificationEngine.js — Core event emission and template rendering.
 *
 * emitEvent(opts)  — inserts notification_events row, resolves recipients,
 *                    queues deliveries per enabled channel.
 * renderTemplate() — replaces {{variable}} tokens in a string.
 */
const { sequelize } = require('../config/database');

// ─── Template rendering ───────────────────────────────────────────────────────

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key));
    } else {
      result[key] = v == null ? '' : String(v);
    }
  }
  return result;
}

function renderTemplate(template, payload) {
  const flat = flattenObject(payload);
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => flat[key.trim()] ?? '');
}

// ─── Resolve recipient address by channel ─────────────────────────────────────

async function resolveRecipientAddress(userId, channelCode) {
  if (!userId) return null;
  const [rows] = await sequelize.query(
    `SELECT email, phone FROM users WHERE id = ? LIMIT 1`,
    { replacements: [userId] }
  );
  const user = rows[0];
  if (!user) return null;
  switch (channelCode) {
    case 'EMAIL': return user.email || null;
    case 'WHATSAPP':
    case 'SMS': return user.phone || null;
    case 'TELEGRAM': return user.phone || String(userId); // telegram chat_id stored elsewhere
    case 'INTERNAL':
    case 'PUSH_WEB': return String(userId);
    default: return String(userId);
  }
}

// ─── Event emission ───────────────────────────────────────────────────────────

async function emitEvent({
  event_code,
  module_code,
  entity_type = null,
  entity_id = null,
  payload = {},
  priority = 'normal',
  user_ids = [],
  employee_ids = [],
  created_by = null,
}) {
  try {
    // 1. Insert notification_event record
    const [event_id] = await sequelize.query(
      `INSERT INTO notification_events
         (event_code, module_code, entity_type, entity_id, payload_json, priority, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          event_code, module_code, entity_type, entity_id,
          JSON.stringify(payload), priority, created_by,
        ],
      }
    );

    // 2. Resolve enabled channels
    const [channels] = await sequelize.query(
      `SELECT code FROM notification_channels WHERE enabled = 1`
    );

    if (!channels.length) return event_id;

    // 3. Resolve recipient user IDs
    let recipientIds = [...(user_ids || [])];
    if (employee_ids && employee_ids.length) {
      const [empRows] = await sequelize.query(
        `SELECT user_id FROM employees WHERE id IN (?) AND user_id IS NOT NULL`,
        { replacements: [employee_ids] }
      );
      recipientIds.push(...empRows.map(r => r.user_id));
    }
    recipientIds = [...new Set(recipientIds.filter(Boolean))];

    if (!recipientIds.length) return event_id;

    // 4. For each channel × recipient, find template and queue delivery
    for (const { code: channel_code } of channels) {
      const [templates] = await sequelize.query(
        `SELECT * FROM notification_templates
         WHERE event_code = ? AND channel_code = ? AND enabled = 1
         LIMIT 1`,
        { replacements: [event_code, channel_code] }
      );
      const tpl = templates[0];
      if (!tpl) continue;

      for (const user_id of recipientIds) {
        // Check user preference (skip if opted out)
        const [prefs] = await sequelize.query(
          `SELECT enabled FROM notification_preferences
           WHERE user_id = ? AND channel_code = ? AND event_code = ?`,
          { replacements: [user_id, channel_code, event_code] }
        );
        if (prefs.length && !prefs[0].enabled) continue;

        // Check quiet hours
        if (prefs.length && prefs[0].quiet_hours_start && prefs[0].quiet_hours_end) {
          const now = new Date();
          const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          if (hhmm >= prefs[0].quiet_hours_start && hhmm <= prefs[0].quiet_hours_end) continue;
        }

        const recipient_address = await resolveRecipientAddress(user_id, channel_code);
        if (!recipient_address && channel_code !== 'INTERNAL') continue;

        const rendered_subject = tpl.subject_template
          ? renderTemplate(tpl.subject_template, payload) : null;
        const rendered_body = renderTemplate(tpl.body_template || '', payload);

        await sequelize.query(
          `INSERT INTO notification_queue
             (event_id, channel_code, recipient_user_id,
              recipient_address, subject, body, status, priority, scheduled_at)
           VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NOW())`,
          {
            replacements: [
              event_id, channel_code, user_id,
              recipient_address || String(user_id),
              rendered_subject, rendered_body, priority,
            ],
          }
        );

        // For INTERNAL channel also insert into internal_notifications
        if (channel_code === 'INTERNAL') {
          await sequelize.query(
            `INSERT INTO internal_notifications
               (user_id, title, message, type, module, entity_type, entity_id)
             VALUES (?, ?, ?, 'info', ?, ?, ?)`,
            {
              replacements: [
                user_id,
                rendered_subject || event_code,
                rendered_body,
                module_code,
                entity_type,
                entity_id,
              ],
            }
          );
        }
      }
    }

    return event_id;
  } catch (err) {
    console.error('[notificationEngine] emitEvent error:', err);
    throw err;
  }
}

module.exports = { emitEvent, renderTemplate };
