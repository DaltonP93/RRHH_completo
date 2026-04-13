/**
 * webhooks.js
 * Sistema de Webhooks para notificaciones en tiempo real a sistemas externos.
 *
 * Cuando ocurre un marcaje, el sistema envía un HTTP POST a todas las
 * URLs registradas (Oracle APEX, ERP, nómina, etc.).
 *
 * Payload enviado:
 * {
 *   "event": "attendance.checkin",
 *   "timestamp": "2026-04-11T08:05:00.000Z",
 *   "data": {
 *     "employeeId": 1,
 *     "employeeCode": "1089",
 *     "employeeName": "Juan García",
 *     "type": "in",
 *     "source": "device",
 *     "deviceName": "Reloj Comedor",
 *     "lateMinutes": 5
 *   }
 * }
 */

const router = require('express').Router();
const crypto = require('crypto');
const axios  = require('axios');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

// ─── Tabla de webhooks (crear en init.sql o migración) ──────────
// La creamos aquí si no existe
async function ensureWebhookTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id          INT PRIMARY KEY AUTO_INCREMENT,
      name        VARCHAR(100) NOT NULL,
      url         VARCHAR(500) NOT NULL,
      secret      VARCHAR(100),
      events      JSON NOT NULL DEFAULT ('["attendance.checkin","attendance.checkout","alert.late"]'),
      active      TINYINT(1) DEFAULT 1,
      last_called DATETIME,
      last_status INT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
ensureWebhookTable().catch(err => logger.warn('Webhook table:', err.message));

// ─── Enviar webhook a todos los destinos registrados ─────────────
async function fireWebhooks(event, data) {
  try {
    const [webhooks] = await sequelize.query(
      'SELECT * FROM webhooks WHERE active = 1',
    );

    for (const wh of webhooks) {
      const events = Array.isArray(wh.events) ? wh.events : JSON.parse(wh.events || '[]');
      if (!events.includes(event) && !events.includes('*')) continue;

      const payload = { event, timestamp: new Date().toISOString(), data };
      const body    = JSON.stringify(payload);

      // Firma HMAC-SHA256 para verificar autenticidad en el receptor
      const signature = wh.secret
        ? 'sha256=' + crypto.createHmac('sha256', wh.secret).update(body).digest('hex')
        : null;

      axios.post(wh.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event':     event,
          'X-Webhook-Timestamp': Date.now().toString(),
          ...(signature && { 'X-Webhook-Signature': signature })
        },
        timeout: 8000,
      })
      .then(res => {
        sequelize.query(
          'UPDATE webhooks SET last_called=NOW(), last_status=? WHERE id=?',
          { replacements: [res.status, wh.id] }
        ).catch(() => {});
        logger.info(`✅ Webhook [${wh.name}] → ${res.status}`);
      })
      .catch(err => {
        sequelize.query(
          'UPDATE webhooks SET last_called=NOW(), last_status=0 WHERE id=?',
          { replacements: [wh.id] }
        ).catch(() => {});
        logger.warn(`⚠️  Webhook [${wh.name}] falló: ${err.message}`);
      });
    }
  } catch (err) {
    logger.error('Error disparando webhooks:', err.message);
  }
}

// ─── Rutas CRUD de webhooks ──────────────────────────────────────
router.use(authenticate, authorize('admin', 'hr'));

/**
 * @swagger
 * /api/webhooks:
 *   get:
 *     tags: [Webhooks]
 *     summary: Listar webhooks registrados
 *     responses:
 *       200:
 *         description: Lista de webhooks
 */
router.get('/', async (req, res) => {
  const [rows] = await sequelize.query(
    'SELECT id, name, url, events, active, last_called, last_status, created_at FROM webhooks ORDER BY id'
  );
  res.json(rows);
});

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     tags: [Webhooks]
 *     summary: Registrar un nuevo webhook
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, url]
 *             properties:
 *               name:   { type: string, example: "Oracle APEX Nómina" }
 *               url:    { type: string, example: "https://apex.empresa.com/ords/hr/webhook/attendance" }
 *               secret: { type: string, example: "mi_secreto_para_validar_firma" }
 *               events: { type: array, items: { type: string }, example: ["attendance.checkin","attendance.checkout","alert.late"] }
 */
router.post('/', async (req, res) => {
  const { name, url, secret, events = ['attendance.checkin', 'attendance.checkout', 'alert.late'] } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name y url son requeridos' });

  const [result] = await sequelize.query(
    'INSERT INTO webhooks (name, url, secret, events) VALUES (?, ?, ?, ?)',
    { replacements: [name, url, secret || null, JSON.stringify(events)] }
  );
  res.status(201).json({ id: result.insertId, message: 'Webhook registrado' });
});

/**
 * @swagger
 * /api/webhooks/{id}/test:
 *   post:
 *     tags: [Webhooks]
 *     summary: Enviar un evento de prueba al webhook
 */
router.post('/:id/test', async (req, res) => {
  const [[wh]] = await sequelize.query('SELECT * FROM webhooks WHERE id = ?', { replacements: [req.params.id] });
  if (!wh) return res.status(404).json({ error: 'Webhook no encontrado' });

  await fireWebhooks('webhook.test', {
    message: 'Prueba de webhook desde el Sistema de Asistencia',
    webhookId: wh.id
  });
  res.json({ message: 'Evento de prueba enviado' });
});

router.put('/:id', async (req, res) => {
  const { name, url, secret, events, active } = req.body;
  await sequelize.query(
    'UPDATE webhooks SET name=COALESCE(?,name), url=COALESCE(?,url), secret=COALESCE(?,secret), events=COALESCE(?,events), active=COALESCE(?,active) WHERE id=?',
    { replacements: [name, url, secret, events ? JSON.stringify(events) : null, active, req.params.id] }
  );
  res.json({ message: 'Webhook actualizado' });
});

router.delete('/:id', authorize('admin'), async (req, res) => {
  await sequelize.query('DELETE FROM webhooks WHERE id = ?', { replacements: [req.params.id] });
  res.json({ message: 'Webhook eliminado' });
});

module.exports = { router, fireWebhooks };
