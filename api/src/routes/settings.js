/**
 * settings.js
 * Configuración general del sistema (branding, tema, login, UX).
 * Almacenado en notification_settings como key → value.
 */
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const audit = require('../services/audit');

// ─── Keys permitidas ────────────────────────────────────────────
// Branding base
const BRANDING_KEYS = [
  'system_name', 'system_company',
  'system_logo_url', 'system_favicon_url',
  'system_login_bg',                 // gradient tailwind (fallback)
  'system_login_bg_image',           // URL local /uploads/*.jpg (preferido)
  'system_login_title', 'system_login_subtitle',
];

// Tema / colores (granular)
const THEME_KEYS = [
  'system_primary_color',            // botón primario / acentos
  'system_secondary_color',          // hover / accent
  'system_accent_color',             // highlights
  'system_sidebar_bg',               // fondo sidebar (hex)
  'system_sidebar_text',             // texto sidebar
  'system_sidebar_active',           // activo sidebar
  'system_theme_mode',               // 'light' | 'dark' | 'auto'
  'system_font_family',              // 'Inter' | 'Roboto' | 'Poppins'
  'system_border_radius',            // 'sm' | 'md' | 'lg' | 'xl'
];

// Layout / UX login
const LOGIN_KEYS = [
  'system_login_layout',             // 'center' | 'left' | 'right' | 'split'
  'system_login_show_datetime',      // '1' | '0'
  'system_login_show_weather',       // '1' | '0' (placeholder futuro)
  'system_login_glass',              // '1' | '0' — efecto glassmorphism
  'system_login_footer',             // texto pie de página
];

// Empleados / display
const DISPLAY_KEYS = [
  'employee_display_mode',           // 'full_name' | 'code_name' | 'code_only'
  'system_date_format',              // 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY'
  'system_time_format',              // '24h' | '12h'
  'system_timezone',                 // 'America/Asuncion' etc
  'system_locale',                   // 'es-PY' | 'es-ES' | 'en-US'
];

const SETTING_KEYS = [
  ...BRANDING_KEYS,
  ...THEME_KEYS,
  ...LOGIN_KEYS,
  ...DISPLAY_KEYS,
];

// ─── Defaults ───────────────────────────────────────────────────
const DEFAULTS = {
  system_name: 'Sistema de Asistencia',
  system_company: '',
  system_logo_url: '',
  system_favicon_url: '',
  system_login_bg: 'from-slate-900 to-blue-900',
  system_login_bg_image: '',
  system_login_title: 'Sistema de Asistencia',
  system_login_subtitle: 'Recursos Humanos',

  system_primary_color: '#2563eb',
  system_secondary_color: '#1e40af',
  system_accent_color: '#8b5cf6',
  system_sidebar_bg: '#0f172a',
  system_sidebar_text: '#94a3b8',
  system_sidebar_active: '#2563eb',
  system_theme_mode: 'light',
  system_font_family: 'Inter',
  system_border_radius: 'lg',

  system_login_layout: 'center',
  system_login_show_datetime: '1',
  system_login_show_weather: '0',
  system_login_glass: '1',
  system_login_footer: '',

  employee_display_mode: 'full_name',
  system_date_format: 'DD/MM/YYYY',
  system_time_format: '24h',
  system_timezone: 'America/Asuncion',
  system_locale: 'es-PY',
};

// ─── GET /api/settings ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT setting_key, setting_value FROM notification_settings
       WHERE setting_key IN (${SETTING_KEYS.map(() => '?').join(',')})`,
      { replacements: SETTING_KEYS }
    );
    const settings = { ...DEFAULTS };
    for (const row of rows) settings[row.setting_key] = row.setting_value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/settings ──────────────────────────────────────────
router.put('/', authenticate, authorize('admin', 'gth', 'gestor'), async (req, res) => {
  try {
    const updates = req.body || {};
    let count = 0;
    for (const [key, value] of Object.entries(updates)) {
      if (!SETTING_KEYS.includes(key)) continue;
      await sequelize.query(
        `INSERT INTO notification_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        { replacements: [key, value == null ? '' : String(value)] }
      );
      count++;
    }
    audit.log({ req, user: req.user, action: 'settings_update', entity: 'settings',
      details: { keys: Object.keys(updates).filter(k => SETTING_KEYS.includes(k)) } });
    res.json({ ok: true, count, message: `${count} configuración(es) guardada(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/settings/reset ───────────────────────────────────
router.post('/reset', authenticate, authorize('admin', 'gth'), async (req, res) => {
  try {
    await sequelize.query(
      `DELETE FROM notification_settings WHERE setting_key IN (${SETTING_KEYS.map(() => '?').join(',')})`,
      { replacements: SETTING_KEYS }
    );
    res.json({ ok: true, message: 'Apariencia restaurada a valores por defecto' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Uploads locales (logo, favicon, bg) ────────────────────────
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/jpg',
  'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
  'image/gif',
];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// POST /api/settings/upload?kind=logo|favicon|login_bg
router.post('/upload', authenticate, authorize('admin', 'gth'), (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido (campo "file")' });

    const publicUrl = `/uploads/${req.file.filename}`;
    const kind = (req.query.kind || '').toString();
    const kindToKey = {
      logo:       'system_logo_url',
      favicon:    'system_favicon_url',
      login_bg:   'system_login_bg_image',
    };
    const key = kindToKey[kind];

    const done = () => res.json({
      ok: true,
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      mime: req.file.mimetype,
      key,
    });

    if (key) {
      sequelize.query(
        `INSERT INTO notification_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        { replacements: [key, publicUrl] }
      ).then(done).catch(e => res.status(500).json({ error: e.message }));
    } else {
      done();
    }
  });
});

module.exports = router;
