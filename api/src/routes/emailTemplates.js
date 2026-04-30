/**
 * emailTemplates.js — CRUD + render de plantillas de email.
 *
 * GET    /api/email-templates                 → listado
 * GET    /api/email-templates/:code           → plantilla por código
 * PUT    /api/email-templates/:code           → editar (admin/gth)
 * POST   /api/email-templates/:code/preview   → renderizar con vars de ejemplo
 * POST   /api/email-templates/:code/test      → enviar a un email de prueba
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { sendMail } = require('../services/emailService');

router.use(authenticate);
router.use(authorize('admin', 'gth', 'hr', 'super_admin'));

// Helper de render: reemplaza {{var}} con valores. Soporta {{var|fallback}}
function renderTemplate(str, vars = {}) {
  if (!str) return '';
  return String(str).replace(/\{\{\s*([\w.-]+)\s*(?:\|\s*([^}]+?))?\s*\}\}/g, (_, k, fb) => {
    const v = vars[k];
    if (v === undefined || v === null || v === '') return fb || '';
    return String(v);
  });
}

// GET / — listado
router.get('/', async (_req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT t.id, t.code, t.name, t.description, t.subject, t.active, t.updated_at,
             u.full_name AS updated_by_name
      FROM email_templates t
      LEFT JOIN users u ON u.id = t.updated_by
      ORDER BY t.code
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:code
router.get('/:code', async (req, res) => {
  try {
    const [[t]] = await sequelize.query(
      'SELECT * FROM email_templates WHERE code = ?',
      { replacements: [req.params.code] }
    );
    if (!t) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ ok: true, data: t });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:code
router.put('/:code',
  requirePermission('configuracion', 'update'),
  async (req, res) => {
    const allowed = ['name','description','subject','body_html','active'];
    const sets = []; const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
    sets.push('updated_by = ?'); vals.push(req.user.id);
    try {
      await sequelize.query(
        `UPDATE email_templates SET ${sets.join(', ')} WHERE code = ?`,
        { replacements: [...vals, req.params.code] }
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// POST /:code/preview — renderizar con variables provistas
router.post('/:code/preview', async (req, res) => {
  try {
    const [[t]] = await sequelize.query(
      'SELECT * FROM email_templates WHERE code = ?',
      { replacements: [req.params.code] }
    );
    if (!t) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const vars = req.body?.vars || {};
    res.json({
      ok: true,
      subject: renderTemplate(t.subject, vars),
      html:    renderTemplate(t.body_html, vars),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:code/test — enviar email de prueba
router.post('/:code/test', async (req, res) => {
  try {
    const { to, vars = {} } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to es requerido' });
    const [[t]] = await sequelize.query(
      'SELECT * FROM email_templates WHERE code = ?',
      { replacements: [req.params.code] }
    );
    if (!t) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const subject = renderTemplate(t.subject, vars);
    const html    = renderTemplate(t.body_html, vars);
    await sendMail({ to, subject, html });
    res.json({ ok: true, sent_to: to });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper exportado: renderiza por código (uso interno desde otros services)
async function renderByCode(code, vars = {}) {
  const [[t]] = await sequelize.query(
    'SELECT subject, body_html, active FROM email_templates WHERE code = ? AND active = 1',
    { replacements: [code] }
  );
  if (!t) return null;
  return {
    subject: renderTemplate(t.subject, vars),
    html:    renderTemplate(t.body_html, vars),
  };
}

module.exports = router;
module.exports.renderByCode = renderByCode;
module.exports.renderTemplate = renderTemplate;
