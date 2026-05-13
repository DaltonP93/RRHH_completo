'use strict';
/**
 * notificationsMulticanal.js — Multicanal notification engine routes.
 *
 * GET    /api/notification-channels                 list channels (hide sensitive config)
 * PUT    /api/notification-channels/:code           update channel config
 * GET    /api/notification-templates-mgmt           list notification templates
 * POST   /api/notification-templates-mgmt           create template
 * PUT    /api/notification-templates-mgmt/:id       update template
 * DELETE /api/notification-templates-mgmt/:id       soft delete
 * POST   /api/notification-events/emit              emit event, queue deliveries
 * POST   /api/notification-events/test              test send
 * GET    /api/notification-queue                    list queued notifications
 * POST   /api/notification-queue/:id/retry          reset to queued
 * GET    /api/notification-preferences              current user preferences
 * PUT    /api/notification-preferences              update preferences
 * GET    /api/internal-notifications                list for current user
 * GET    /api/internal-notifications/unread-count   unread count
 * POST   /api/internal-notifications/:id/read       mark as read
 * POST   /api/internal-notifications/read-all       mark all read
 * GET    /api/notification-delivery-logs            delivery logs
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { emitEvent, renderTemplate } = require('../services/notificationEngine');

router.use(authenticate);

const ADMIN_ROLES = ['admin', 'hr', 'gth', 'super_admin'];

// Sensitive config keys to hide from API responses
const SENSITIVE_KEYS = ['password', 'api_key', 'secret', 'token', 'auth_token', 'smtp_pass'];

function redactConfig(configJson) {
  if (!configJson) return null;
  try {
    const config = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
    const redacted = { ...config };
    for (const key of Object.keys(redacted)) {
      if (SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
        redacted[key] = '***';
      }
    }
    return redacted;
  } catch {
    return null;
  }
}

// ─── NOTIFICATION CHANNELS ───────────────────────────────────────────────────

router.get('/notification-channels', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM notification_channels ORDER BY code ASC`
    );
    const safe = rows.map(r => ({
      ...r,
      config_json: redactConfig(r.config_json),
    }));
    res.json(safe);
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-channels error:', err);
    res.status(500).json({ error: 'Error al listar canales' });
  }
});

router.put('/notification-channels/:code', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { enabled, config_json } = req.body;
    const [[existing]] = await sequelize.query(
      'SELECT * FROM notification_channels WHERE code = ?',
      { replacements: [req.params.code] }
    );
    if (!existing) return res.status(404).json({ error: 'Canal no encontrado' });

    // Merge config: preserve existing sensitive keys unless explicitly provided
    let mergedConfig = existing.config_json
      ? (typeof existing.config_json === 'string' ? JSON.parse(existing.config_json) : existing.config_json)
      : {};

    if (config_json && typeof config_json === 'object') {
      mergedConfig = { ...mergedConfig, ...config_json };
    }

    await sequelize.query(
      `UPDATE notification_channels
          SET enabled     = COALESCE(?, enabled),
              config_json = ?,
              updated_at  = NOW()
        WHERE code = ?`,
      { replacements: [enabled !== undefined ? (enabled ? 1 : 0) : null, JSON.stringify(mergedConfig), req.params.code] }
    );

    const [[updated]] = await sequelize.query(
      'SELECT * FROM notification_channels WHERE code = ?',
      { replacements: [req.params.code] }
    );
    res.json({ ...updated, config_json: redactConfig(updated.config_json) });
  } catch (err) {
    console.error('[notificationsMulticanal] PUT /notification-channels/:code error:', err);
    res.status(500).json({ error: 'Error al actualizar canal' });
  }
});

// ─── NOTIFICATION TEMPLATES MANAGEMENT ──────────────────────────────────────

router.get('/notification-templates-mgmt', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { event_code, channel_code, company_id } = req.query;
    let where = 'WHERE nt.deleted_at IS NULL';
    const params = [];
    if (event_code)  { where += ' AND nt.event_code = ?';   params.push(event_code); }
    if (channel_code){ where += ' AND nt.channel_code = ?'; params.push(channel_code); }
    if (company_id)  { where += ' AND nt.company_id = ?';   params.push(Number(company_id)); }

    const [rows] = await sequelize.query(
      `SELECT nt.*, nc.name AS channel_name
         FROM notification_templates nt
         LEFT JOIN notification_channels nc ON nc.code = nt.channel_code
       ${where}
       ORDER BY nt.event_code ASC, nt.channel_code ASC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-templates-mgmt error:', err);
    res.status(500).json({ error: 'Error al listar plantillas' });
  }
});

router.post('/notification-templates-mgmt', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { event_code, channel_code, subject_template, body_template, company_id, enabled } = req.body;
    if (!event_code || !channel_code || !body_template) {
      return res.status(400).json({ error: 'event_code, channel_code y body_template son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO notification_templates
         (event_code, channel_code, subject_template, body_template, company_id, enabled, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
      { replacements: [event_code, channel_code, subject_template || null, body_template, company_id || null, enabled !== false ? 1 : 0, req.user.id] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM notification_templates WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[notificationsMulticanal] POST /notification-templates-mgmt error:', err);
    res.status(500).json({ error: 'Error al crear plantilla' });
  }
});

router.put('/notification-templates-mgmt/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { subject_template, body_template, enabled } = req.body;
    await sequelize.query(
      `UPDATE notification_templates
          SET subject_template = COALESCE(?, subject_template),
              body_template    = COALESCE(?, body_template),
              enabled          = COALESCE(?, enabled),
              updated_at       = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
      { replacements: [subject_template || null, body_template || null, enabled !== undefined ? (enabled ? 1 : 0) : null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM notification_templates WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json(updated);
  } catch (err) {
    console.error('[notificationsMulticanal] PUT /notification-templates-mgmt/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar plantilla' });
  }
});

router.delete('/notification-templates-mgmt/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM notification_templates WHERE id = ? AND deleted_at IS NULL',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Plantilla no encontrada' });

    await sequelize.query(
      `UPDATE notification_templates SET deleted_at = NOW() WHERE id = ?`,
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Plantilla eliminada' });
  } catch (err) {
    console.error('[notificationsMulticanal] DELETE /notification-templates-mgmt/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
});

// ─── EMIT EVENT ──────────────────────────────────────────────────────────────

router.post('/notification-events/emit', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const {
      event_code, module_code, entity_type, entity_id,
      payload_json, priority,
      recipient_user_ids = [],
      recipient_employee_ids = [],
    } = req.body;

    if (!event_code || !module_code) {
      return res.status(400).json({ error: 'event_code y module_code son requeridos' });
    }

    const event_id = await emitEvent({
      event_code,
      module_code,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      payload: payload_json || {},
      priority: priority || 'normal',
      user_ids: recipient_user_ids,
      employee_ids: recipient_employee_ids,
      created_by: req.user.id,
    });

    res.status(201).json({ event_id, message: 'Evento emitido' });
  } catch (err) {
    console.error('[notificationsMulticanal] POST /notification-events/emit error:', err);
    res.status(500).json({ error: 'Error al emitir evento' });
  }
});

// ─── TEST EVENT ──────────────────────────────────────────────────────────────

router.post('/notification-events/test', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const {
      event_code, module_code, entity_type, entity_id,
      payload_json, priority,
      recipient_user_ids = [],
      recipient_employee_ids = [],
    } = req.body;

    if (!event_code || !module_code) {
      return res.status(400).json({ error: 'event_code y module_code son requeridos' });
    }

    const event_id = await emitEvent({
      event_code: `TEST_${event_code}`,
      module_code,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      payload: { ...(payload_json || {}), _test: true },
      priority: priority || 'normal',
      user_ids: recipient_user_ids,
      employee_ids: recipient_employee_ids,
      created_by: req.user.id,
    });

    res.status(201).json({ event_id, message: 'Evento de prueba emitido' });
  } catch (err) {
    console.error('[notificationsMulticanal] POST /notification-events/test error:', err);
    res.status(500).json({ error: 'Error al emitir evento de prueba' });
  }
});

// ─── NOTIFICATION QUEUE ──────────────────────────────────────────────────────

router.get('/notification-queue', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { status, channel_code, date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status)       { where += ' AND nq.status = ?';       params.push(status); }
    if (channel_code) { where += ' AND nq.channel_code = ?'; params.push(channel_code); }
    if (date_from)    { where += ' AND nq.created_at >= ?';  params.push(date_from); }
    if (date_to)      { where += ' AND nq.created_at <= ?';  params.push(date_to); }

    const [rows] = await sequelize.query(
      `SELECT nq.*,
              ne.event_code,
              ne.module_code
         FROM notification_queue nq
         LEFT JOIN notification_events ne ON ne.id = nq.event_id
       ${where}
       ORDER BY nq.created_at DESC
       LIMIT 200`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-queue error:', err);
    res.status(500).json({ error: 'Error al listar cola' });
  }
});

router.post('/notification-queue/:id/retry', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM notification_queue WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Entrada no encontrada' });

    await sequelize.query(
      `UPDATE notification_queue SET status='queued', attempts=0, error_message=NULL, updated_at=NOW() WHERE id=?`,
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Entrada puesta en cola para reintento' });
  } catch (err) {
    console.error('[notificationsMulticanal] POST /notification-queue/:id/retry error:', err);
    res.status(500).json({ error: 'Error al reintentar' });
  }
});

// ─── NOTIFICATION PREFERENCES ────────────────────────────────────────────────

router.get('/notification-preferences', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT np.*, nc.name AS channel_name
         FROM notification_preferences np
         LEFT JOIN notification_channels nc ON nc.code = np.channel_code
        WHERE np.user_id = ?
        ORDER BY np.event_code ASC, np.channel_code ASC`,
      { replacements: [req.user.id] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-preferences error:', err);
    res.status(500).json({ error: 'Error al obtener preferencias' });
  }
});

router.put('/notification-preferences', async (req, res) => {
  try {
    const { preferences } = req.body; // [{event_code, channel_code, enabled}]
    if (!Array.isArray(preferences)) {
      return res.status(400).json({ error: 'preferences debe ser un array' });
    }

    for (const pref of preferences) {
      await sequelize.query(
        `INSERT INTO notification_preferences (user_id, event_code, channel_code, enabled, created_at, updated_at)
         VALUES (?,?,?,?,NOW(),NOW())
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), updated_at=NOW()`,
        { replacements: [req.user.id, pref.event_code, pref.channel_code, pref.enabled ? 1 : 0] }
      );
    }

    const [updated] = await sequelize.query(
      `SELECT * FROM notification_preferences WHERE user_id = ?`,
      { replacements: [req.user.id] }
    );
    res.json(updated);
  } catch (err) {
    console.error('[notificationsMulticanal] PUT /notification-preferences error:', err);
    res.status(500).json({ error: 'Error al actualizar preferencias' });
  }
});

// ─── INTERNAL NOTIFICATIONS ──────────────────────────────────────────────────

// NOTE: unread-count must be declared BEFORE /:id to avoid Express matching "unread-count" as :id
router.get('/internal-notifications/unread-count', async (req, res) => {
  try {
    const [[result]] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM internal_notifications WHERE user_id = ? AND read_at IS NULL`,
      { replacements: [req.user.id] }
    );
    res.json({ count: Number(result.count) });
  } catch (err) {
    console.error('[notificationsMulticanal] GET /internal-notifications/unread-count error:', err);
    res.status(500).json({ error: 'Error al contar no leídos' });
  }
});

router.get('/internal-notifications', async (req, res) => {
  try {
    const { unread_only, limit = 50, offset = 0 } = req.query;
    let where = 'WHERE n.user_id = ?';
    const params = [req.user.id];
    if (unread_only === '1') { where += ' AND n.read_at IS NULL'; }

    const [rows] = await sequelize.query(
      `SELECT * FROM internal_notifications n
       ${where}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      { replacements: [...params, Number(limit), Number(offset)] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[notificationsMulticanal] GET /internal-notifications error:', err);
    res.status(500).json({ error: 'Error al listar notificaciones' });
  }
});

router.post('/internal-notifications/read-all', async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE internal_notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL`,
      { replacements: [req.user.id] }
    );
    res.json({ message: 'Todas las notificaciones marcadas como leídas' });
  } catch (err) {
    console.error('[notificationsMulticanal] POST /internal-notifications/read-all error:', err);
    res.status(500).json({ error: 'Error al marcar como leídas' });
  }
});

router.post('/internal-notifications/:id/read', async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM internal_notifications WHERE id = ? AND user_id = ?',
      { replacements: [req.params.id, req.user.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Notificación no encontrada' });

    await sequelize.query(
      `UPDATE internal_notifications SET read_at = NOW() WHERE id = ?`,
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Marcada como leída' });
  } catch (err) {
    console.error('[notificationsMulticanal] POST /internal-notifications/:id/read error:', err);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

// ─── DELIVERY LOGS ───────────────────────────────────────────────────────────

router.get('/notification-delivery-logs', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { queue_id, status, date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (queue_id)  { where += ' AND ndl.queue_id = ?';    params.push(Number(queue_id)); }
    if (status)    { where += ' AND ndl.status = ?';       params.push(status); }
    if (date_from) { where += ' AND ndl.created_at >= ?';  params.push(date_from); }
    if (date_to)   { where += ' AND ndl.created_at <= ?';  params.push(date_to); }

    const [rows] = await sequelize.query(
      `SELECT ndl.*, nq.channel_code, nq.recipient_address
         FROM notification_delivery_logs ndl
         LEFT JOIN notification_queue nq ON nq.id = ndl.queue_id
       ${where}
       ORDER BY ndl.created_at DESC
       LIMIT 200`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-delivery-logs error:', err);
    res.status(500).json({ error: 'Error al listar logs de entrega' });
  }
});

// ─── EVENT CATALOG ───────────────────────────────────────────────────────────

router.get('/notification-event-catalog', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM notification_event_catalog WHERE is_active = 1
       ORDER BY category, name`
    );
    res.json(rows);
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-event-catalog error:', err);
    res.status(500).json({ error: 'Error al listar catálogo de eventos' });
  }
});

// ─── NOTIFICATION MATRIX (events × channels with template status) ─────────────

router.get('/notification-matrix', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [events] = await sequelize.query(
      `SELECT * FROM notification_event_catalog WHERE is_active = 1
       ORDER BY category, name`
    );
    const [channels] = await sequelize.query(
      `SELECT code, name, enabled FROM notification_channels ORDER BY id`
    );
    const [templates] = await sequelize.query(
      `SELECT event_code, channel_code, id AS template_id, enabled, name
         FROM notification_templates WHERE company_id IS NULL`
    );
    const [prefs] = await sequelize.query(
      `SELECT event_code, channel_code, COUNT(*) AS user_count
         FROM notification_preferences
         WHERE enabled = 0
         GROUP BY event_code, channel_code`
    );

    // Build template lookup: event_code → channel_code → template info
    const tplMap = {};
    for (const t of templates) {
      if (!tplMap[t.event_code]) tplMap[t.event_code] = {};
      tplMap[t.event_code][t.channel_code] = { template_id: t.template_id, enabled: t.enabled, name: t.name };
    }
    const optOutMap = {};
    for (const p of prefs) {
      if (!optOutMap[p.event_code]) optOutMap[p.event_code] = {};
      optOutMap[p.event_code][p.channel_code] = p.user_count;
    }

    const matrix = events.map(ev => ({
      event_code: ev.event_code,
      module_code: ev.module_code,
      category: ev.category,
      name: ev.name,
      description: ev.description,
      severity: ev.severity,
      default_channels: typeof ev.default_channels === 'string'
        ? JSON.parse(ev.default_channels) : (ev.default_channels || []),
      channels: channels.map(ch => ({
        channel_code: ch.code,
        channel_name: ch.name,
        channel_enabled: !!ch.enabled,
        template: tplMap[ev.event_code]?.[ch.code] || null,
        opted_out_users: optOutMap[ev.event_code]?.[ch.code] || 0,
      })),
    }));

    res.json({ events: matrix, channels });
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-matrix error:', err);
    res.status(500).json({ error: 'Error al obtener matriz de notificaciones' });
  }
});

// PUT /api/notification-matrix — toggle a specific event × channel template
router.put('/notification-matrix', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { event_code, channel_code, enabled } = req.body;
    if (!event_code || !channel_code) return res.status(400).json({ error: 'event_code y channel_code requeridos' });

    const [rows] = await sequelize.query(
      `SELECT id FROM notification_templates
         WHERE event_code = ? AND channel_code = ? AND company_id IS NULL LIMIT 1`,
      { replacements: [event_code, channel_code] }
    );

    if (!rows.length) {
      // Create minimal template if none exists
      await sequelize.query(
        `INSERT INTO notification_templates (company_id, channel_code, event_code, name, body_template, enabled)
           VALUES (NULL, ?, ?, ?, '', ?)`,
        { replacements: [channel_code, event_code, `${event_code} — ${channel_code}`, enabled ? 1 : 0] }
      );
    } else {
      await sequelize.query(
        `UPDATE notification_templates SET enabled = ? WHERE event_code = ? AND channel_code = ? AND company_id IS NULL`,
        { replacements: [enabled ? 1 : 0, event_code, channel_code] }
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[notificationsMulticanal] PUT /notification-matrix error:', err);
    res.status(500).json({ error: 'Error al actualizar matriz' });
  }
});

// ─── BATCH PREFERENCES (current user) ───────────────────────────────────────

// GET /api/notification-preferences/my — full preference matrix for current user
router.get('/notification-preferences/my', async (req, res) => {
  try {
    const userId = req.user.id;
    const [events] = await sequelize.query(
      `SELECT event_code, module_code, category, name, severity FROM notification_event_catalog WHERE is_active = 1 ORDER BY category, name`
    );
    const [channels] = await sequelize.query(
      `SELECT code, name, enabled FROM notification_channels WHERE enabled = 1 ORDER BY id`
    );
    const [prefs] = await sequelize.query(
      `SELECT event_code, channel_code, enabled, quiet_hours_start, quiet_hours_end
         FROM notification_preferences WHERE user_id = ?`,
      { replacements: [userId] }
    );
    const prefMap = {};
    for (const p of prefs) {
      if (!prefMap[p.event_code]) prefMap[p.event_code] = {};
      prefMap[p.event_code][p.channel_code] = { enabled: !!p.enabled, quiet_hours_start: p.quiet_hours_start, quiet_hours_end: p.quiet_hours_end };
    }
    const matrix = events.map(ev => ({
      ...ev,
      channels: channels.map(ch => ({
        channel_code: ch.code,
        channel_name: ch.name,
        enabled: prefMap[ev.event_code]?.[ch.code]?.enabled ?? true, // default opt-in
        quiet_hours_start: prefMap[ev.event_code]?.[ch.code]?.quiet_hours_start || null,
        quiet_hours_end:   prefMap[ev.event_code]?.[ch.code]?.quiet_hours_end   || null,
      })),
    }));
    res.json({ events: matrix, channels });
  } catch (err) {
    console.error('[notificationsMulticanal] GET /notification-preferences/my error:', err);
    res.status(500).json({ error: 'Error al cargar preferencias' });
  }
});

// PUT /api/notification-preferences/my/batch — upsert multiple preferences at once
router.put('/notification-preferences/my/batch', async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body; // [{ event_code, channel_code, enabled, quiet_hours_start, quiet_hours_end }]
    if (!Array.isArray(preferences) || !preferences.length) {
      return res.status(400).json({ error: 'Se requiere array de preferencias' });
    }
    for (const p of preferences) {
      await sequelize.query(
        `INSERT INTO notification_preferences (user_id, event_code, channel_code, enabled, quiet_hours_start, quiet_hours_end, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE enabled = VALUES(enabled),
             quiet_hours_start = VALUES(quiet_hours_start),
             quiet_hours_end   = VALUES(quiet_hours_end),
             updated_at        = NOW()`,
        { replacements: [userId, p.event_code, p.channel_code, p.enabled ? 1 : 0, p.quiet_hours_start || null, p.quiet_hours_end || null] }
      );
    }
    res.json({ ok: true, updated: preferences.length });
  } catch (err) {
    console.error('[notificationsMulticanal] PUT /notification-preferences/my/batch error:', err);
    res.status(500).json({ error: 'Error al guardar preferencias' });
  }
});

// ─── QUEUE PROCESSOR ─────────────────────────────────────────────────────────

/**
 * Process pending notification_queue entries.
 * Should be called by the scheduler (e.g., every minute via PM2 cron or setInterval).
 */
async function processQueue() {
  let processed = 0;
  let failed = 0;

  try {
    const [entries] = await sequelize.query(
      `SELECT nq.*, nc.config_json AS channel_config
         FROM notification_queue nq
         LEFT JOIN notification_channels nc ON nc.code = nq.channel_code
        WHERE nq.status = 'queued'
          AND nq.scheduled_at <= NOW()
          AND nq.attempts < nq.max_attempts
        LIMIT 50`
    );

    for (const entry of entries) {
      const startTime = Date.now();
      let success = false;
      let errorMsg = null;
      let providerResponse = null;

      try {
        // Mark as processing
        await sequelize.query(
          `UPDATE notification_queue SET status='processing', attempts=attempts+1, updated_at=NOW() WHERE id=?`,
          { replacements: [entry.id] }
        );

        switch (entry.channel_code) {
          case 'EMAIL': {
            // Real SMTP would use emailService; here we log to console as placeholder
            // In production: await emailService.sendMail({ to: entry.recipient_address, subject: entry.subject, html: entry.body })
            console.log(`[notificationQueue] EMAIL → ${entry.recipient_address} | Subject: ${entry.subject}`);
            providerResponse = JSON.stringify({ delivered: true, channel: 'EMAIL' });
            success = true;
            break;
          }
          case 'INTERNAL': {
            // Already inserted into internal_notifications at emit time
            providerResponse = JSON.stringify({ channel: 'INTERNAL', note: 'handled_at_emit' });
            success = true;
            break;
          }
          case 'WHATSAPP': {
            // Placeholder for WhatsApp API integration
            console.log(`[notificationQueue] WHATSAPP → ${entry.recipient_address} | Body: ${String(entry.body).slice(0, 100)}`);
            providerResponse = JSON.stringify({ channel: 'WHATSAPP', queued: true });
            success = true;
            break;
          }
          case 'TELEGRAM': {
            // Placeholder for Telegram Bot API integration
            console.log(`[notificationQueue] TELEGRAM → ${entry.recipient_address} | Body: ${String(entry.body).slice(0, 100)}`);
            providerResponse = JSON.stringify({ channel: 'TELEGRAM', queued: true });
            success = true;
            break;
          }
          case 'SMS': {
            // Placeholder for SMS provider integration
            console.log(`[notificationQueue] SMS → ${entry.recipient_address} | Body: ${String(entry.body).slice(0, 160)}`);
            providerResponse = JSON.stringify({ channel: 'SMS', queued: true });
            success = true;
            break;
          }
          default:
            console.warn(`[notificationQueue] Unknown channel: ${entry.channel_code}`);
            providerResponse = JSON.stringify({ error: `Unknown channel: ${entry.channel_code}` });
            success = false;
            errorMsg = `Unknown channel: ${entry.channel_code}`;
        }
      } catch (dispatchErr) {
        console.error(`[notificationQueue] Dispatch error for queue entry ${entry.id}:`, dispatchErr);
        errorMsg = dispatchErr.message || 'Dispatch error';
        success = false;
      }

      const durationMs = Date.now() - startTime;
      const newStatus = success ? 'sent' : (entry.attempts + 1 >= entry.max_attempts ? 'failed' : 'queued');

      await sequelize.query(
        `UPDATE notification_queue
            SET status        = ?,
                sent_at       = ${success ? 'NOW()' : 'sent_at'},
                error_message = ?,
                updated_at    = NOW()
          WHERE id = ?`,
        { replacements: [newStatus, errorMsg, entry.id] }
      );

      await sequelize.query(
        `INSERT INTO notification_delivery_logs
           (queue_id, provider, response_payload, http_status, status, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        { replacements: [
            entry.id,
            entry.channel_code,
            providerResponse,
            success ? 200 : 500,
            success ? 'success' : 'failed',
          ]
        }
      );

      success ? processed++ : failed++;
    }
  } catch (err) {
    console.error('[notificationQueue] processQueue error:', err);
  }

  return { processed, failed };
}

module.exports = router;
module.exports.processQueue = processQueue;
