/**
 * settings.js
 * Configuración general del sistema (branding, nombre, logo, etc.)
 * Almacenado en notification_settings como key→value
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

const SETTING_KEYS = [
  'system_name', 'system_logo_url', 'system_favicon_url',
  'system_login_bg', 'system_primary_color', 'system_login_title',
  'system_login_subtitle', 'system_company',
];

// GET /api/settings — obtener todas las configuraciones
router.get('/', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT setting_key, setting_value FROM notification_settings WHERE setting_key IN (${SETTING_KEYS.map(() => '?').join(',')})`,
      { replacements: SETTING_KEYS }
    );
    const settings = {};
    // Defaults
    settings.system_name         = 'Sistema de Asistencia';
    settings.system_login_title  = 'Sistema de Asistencia';
    settings.system_login_subtitle = 'Recursos Humanos';
    settings.system_company      = '';
    settings.system_logo_url     = '';
    settings.system_favicon_url  = '';
    settings.system_login_bg     = 'from-slate-900 to-blue-900';
    settings.system_primary_color = '#2563eb';
    for (const row of rows) settings[row.setting_key] = row.setting_value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — guardar configuraciones (admin/gestor)
router.put('/', authenticate, authorize('admin', 'gestor'), async (req, res) => {
  try {
    const updates = req.body; // { system_name: 'Nuevo', ... }
    for (const [key, value] of Object.entries(updates)) {
      if (!SETTING_KEYS.includes(key)) continue;
      await sequelize.query(
        `INSERT INTO notification_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        { replacements: [key, value] }
      );
    }
    res.json({ ok: true, message: 'Configuración guardada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
