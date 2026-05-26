'use strict';
/**
 * documents.js — Document lifecycle management.
 *
 * GET    /api/documents                    list with filters
 * POST   /api/documents                    create & render
 * GET    /api/documents/:id                detail (latest version + recipients + comments)
 * PUT    /api/documents/:id                update title/status
 * DELETE /api/documents/:id                cancel (status=cancelled)
 * POST   /api/documents/:id/send           send to employee
 * POST   /api/documents/:id/sign           sign document
 * POST   /api/documents/:id/view           mark as viewed
 * POST   /api/documents/:id/comments       add comment
 * GET    /api/documents/:id/comments       list comments
 * GET    /api/documents/:id/audit          audit log
 * GET    /api/documents/:id/versions       version history
 * GET    /api/document-folders             list folders
 * POST   /api/document-folders             create folder
 */
const crypto = require('crypto');
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);
router.use(authorize('admin', 'hr', 'gth', 'super_admin'));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Replace {{namespace.field}} tokens in an HTML template using data objects.
 */
function renderHtml(template, vars) {
  let result = template || '';
  for (const [ns, data] of Object.entries(vars)) {
    if (!data || typeof data !== 'object') continue;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(
        new RegExp(`\\{\\{${ns}\\.${key}\\}\\}`, 'g'),
        value != null ? String(value) : ''
      );
    }
  }
  return result;
}

async function logAudit(document_id, action, user_id, extra = {}) {
  try {
    await sequelize.query(
      `INSERT INTO document_audit_logs (document_id, action, performed_by, signer_ip, meta_json, created_at)
       VALUES (?,?,?,?,?,NOW())`,
      {
        replacements: [
          document_id, action, user_id || null,
          extra.ip || null,
          extra.meta ? JSON.stringify(extra.meta) : null,
        ],
      }
    );
  } catch (_) { /* non-fatal */ }
}

// ─── LIST ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { employee_id, module, status, template_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (employee_id)  { where += ' AND d.employee_id = ?';  params.push(Number(employee_id)); }
    if (module)       { where += ' AND d.module = ?';        params.push(module); }
    if (status)       { where += ' AND d.status = ?';        params.push(status); }
    if (template_id)  { where += ' AND d.template_id = ?';   params.push(Number(template_id)); }

    const [rows] = await sequelize.query(
      `SELECT d.*,
              CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              dt.name AS template_name
         FROM documents d
         LEFT JOIN employees e ON e.id = d.employee_id
         LEFT JOIN document_templates dt ON dt.id = d.template_id
       ${where}
       ORDER BY d.created_at DESC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('[documents] GET / error:', err);
    res.status(500).json({ error: 'Error al listar documentos' });
  }
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { template_id, employee_id, title, module, module_entity_id } = req.body;
    if (!employee_id || !title || !module) {
      await t.rollback();
      return res.status(400).json({ error: 'employee_id, title y module son requeridos' });
    }

    // Fetch employee data
    const [[emp]] = await sequelize.query(
      `SELECT e.*, CONCAT(e.first_name,' ',e.last_name) AS full_name,
              p.name AS position_name
         FROM employees e
         LEFT JOIN positions p ON p.id = e.position_id
        WHERE e.id = ?`,
      { replacements: [employee_id], transaction: t }
    );
    if (!emp) { await t.rollback(); return res.status(404).json({ error: 'Empleado no encontrado' }); }

    // Fetch company data
    const [[company]] = await sequelize.query(
      `SELECT legal_name, ruc, trade_name FROM companies WHERE id = ? LIMIT 1`,
      { replacements: [emp.company_id || 1], transaction: t }
    );

    let rendered_html = '';

    if (template_id) {
      const [[tmpl]] = await sequelize.query(
        'SELECT html_template FROM document_templates WHERE id = ? AND status != ?',
        { replacements: [template_id, 'deprecated'], transaction: t }
      );
      if (tmpl && tmpl.html_template) {
        rendered_html = renderHtml(tmpl.html_template, {
          employee: {
            full_name:       emp.full_name,
            document_number: emp.document_number,
            position:        emp.position_name,
            hire_date:       emp.hire_date,
            base_salary:     emp.base_salary,
          },
          company: {
            legal_name:  company?.legal_name  || '',
            ruc:         company?.ruc          || '',
            trade_name:  company?.trade_name   || '',
          },
          date: {
            today: new Date().toISOString().slice(0, 10),
          },
        });
      }
    }

    // Insert document
    const [docResult] = await sequelize.query(
      `INSERT INTO documents
         (template_id, employee_id, title, module, module_entity_id,
          status, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,'draft',?,NOW(),NOW())`,
      {
        replacements: [
          template_id || null, employee_id, title, module,
          module_entity_id || null, req.user.id,
        ],
        transaction: t,
      }
    );
    const document_id = docResult;

    // Insert first version
    const contentHash = sha256(rendered_html);
    await sequelize.query(
      `INSERT INTO document_versions
         (document_id, version_number, content_json, hash_sha256, created_by, created_at)
       VALUES (?,1,?,?,?,NOW())`,
      {
        replacements: [document_id, rendered_html, contentHash, req.user.id],
        transaction: t,
      }
    );

    // Audit log
    await sequelize.query(
      `INSERT INTO document_audit_logs (document_id, action, performed_by, created_at)
       VALUES (?,'created',?,NOW())`,
      { replacements: [document_id, req.user.id], transaction: t }
    );

    await t.commit();

    const [[created]] = await sequelize.query(
      'SELECT * FROM documents WHERE id = ?',
      { replacements: [document_id] }
    );
    res.status(201).json(created);
  } catch (err) {
    await t.rollback();
    console.error('[documents] POST / error:', err);
    res.status(500).json({ error: 'Error al crear documento' });
  }
});

// ─── DETAIL ──────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[doc]] = await sequelize.query(
      `SELECT d.*,
              CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              dt.name AS template_name
         FROM documents d
         LEFT JOIN employees e ON e.id = d.employee_id
         LEFT JOIN document_templates dt ON dt.id = d.template_id
        WHERE d.id = ?`,
      { replacements: [req.params.id] }
    );
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const [[latestVersion]] = await sequelize.query(
      `SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT 1`,
      { replacements: [req.params.id] }
    );

    const [recipients] = await sequelize.query(
      `SELECT dr.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name
         FROM document_recipients dr
         LEFT JOIN employees e ON e.id = dr.employee_id
        WHERE dr.document_id = ?`,
      { replacements: [req.params.id] }
    );

    const [comments] = await sequelize.query(
      `SELECT dc.*, u.first_name, u.last_name
         FROM document_comments dc
         LEFT JOIN users u ON u.id = dc.user_id
        WHERE dc.document_id = ?
        ORDER BY dc.created_at ASC`,
      { replacements: [req.params.id] }
    );

    res.json({ ...doc, latest_version: latestVersion || null, recipients, comments });
  } catch (err) {
    console.error('[documents] GET /:id error:', err);
    res.status(500).json({ error: 'Error al obtener documento' });
  }
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id, status FROM documents WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Documento no encontrado' });
    if (['cancelled', 'signed'].includes(existing.status)) {
      return res.status(400).json({ error: `No se puede editar un documento en estado ${existing.status}` });
    }

    const { title, status } = req.body;
    await sequelize.query(
      `UPDATE documents SET
         title      = COALESCE(?, title),
         status     = COALESCE(?, status),
         updated_at = NOW()
       WHERE id = ?`,
      { replacements: [title || null, status || null, req.params.id] }
    );

    const [[updated]] = await sequelize.query(
      'SELECT * FROM documents WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json(updated);
  } catch (err) {
    console.error('[documents] PUT /:id error:', err);
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
});

// ─── CANCEL ──────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM documents WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Documento no encontrado' });

    await sequelize.query(
      `UPDATE documents SET status='cancelled', updated_at=NOW() WHERE id=?`,
      { replacements: [req.params.id] }
    );
    await logAudit(req.params.id, 'cancelled', req.user.id);
    res.json({ message: 'Documento cancelado' });
  } catch (err) {
    console.error('[documents] DELETE /:id error:', err);
    res.status(500).json({ error: 'Error al cancelar documento' });
  }
});

// ─── SEND ────────────────────────────────────────────────────────────────────
router.post('/:id/send', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const [[doc]] = await sequelize.query(
      'SELECT * FROM documents WHERE id = ?',
      { replacements: [req.params.id], transaction: t }
    );
    if (!doc) { await t.rollback(); return res.status(404).json({ error: 'Documento no encontrado' }); }

    // Insert recipient
    await sequelize.query(
      `INSERT INTO document_recipients
         (document_id, employee_id, recipient_type, status, created_at, updated_at)
       VALUES (?,'?','SIGNER','sent',NOW(),NOW())`,
      { replacements: [req.params.id, doc.employee_id], transaction: t }
    );

    await sequelize.query(
      `UPDATE documents SET status='sent', sent_at=NOW(), updated_at=NOW() WHERE id=?`,
      { replacements: [req.params.id], transaction: t }
    );

    await sequelize.query(
      `INSERT INTO document_audit_logs (document_id, action, performed_by, created_at)
       VALUES (?,'sent',?,NOW())`,
      { replacements: [req.params.id, req.user.id], transaction: t }
    );

    await t.commit();
    res.json({ success: true, message: 'Documento enviado' });
  } catch (err) {
    await t.rollback();
    console.error('[documents] POST /:id/send error:', err);
    res.status(500).json({ error: 'Error al enviar documento' });
  }
});

// ─── SIGN ────────────────────────────────────────────────────────────────────
router.post('/:id/sign', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { recipient_id, signature_type, signature_image_base64 } = req.body;
    if (!recipient_id || !signature_type) {
      await t.rollback();
      return res.status(400).json({ error: 'recipient_id y signature_type son requeridos' });
    }

    const [[recipient]] = await sequelize.query(
      'SELECT * FROM document_recipients WHERE id = ? AND document_id = ?',
      { replacements: [recipient_id, req.params.id], transaction: t }
    );
    if (!recipient) {
      await t.rollback();
      return res.status(404).json({ error: 'Destinatario no encontrado' });
    }

    // Mark recipient as signed
    await sequelize.query(
      `UPDATE document_recipients SET status='signed', signed_at=NOW(), updated_at=NOW() WHERE id=?`,
      { replacements: [recipient_id], transaction: t }
    );

    // Insert signature record
    await sequelize.query(
      `INSERT INTO document_signatures
         (document_id, recipient_id, signature_type, signature_image, signed_at, created_at)
       VALUES (?,?,?,?,NOW(),NOW())`,
      {
        replacements: [
          req.params.id, recipient_id, signature_type,
          signature_image_base64 || null,
        ],
        transaction: t,
      }
    );

    // Check if all recipients have signed
    const [[{ pending }]] = await sequelize.query(
      `SELECT COUNT(*) AS pending FROM document_recipients
        WHERE document_id = ? AND recipient_type = 'SIGNER' AND status != 'signed'`,
      { replacements: [req.params.id], transaction: t }
    );

    if (Number(pending) === 0) {
      await sequelize.query(
        `UPDATE documents SET status='signed', updated_at=NOW() WHERE id=?`,
        { replacements: [req.params.id], transaction: t }
      );
    }

    await sequelize.query(
      `INSERT INTO document_audit_logs (document_id, action, performed_by, signer_ip, created_at)
       VALUES (?,'signed',?,?,NOW())`,
      { replacements: [req.params.id, req.user.id, req.ip || null], transaction: t }
    );

    await t.commit();
    res.json({ success: true, all_signed: Number(pending) === 0 });
  } catch (err) {
    await t.rollback();
    console.error('[documents] POST /:id/sign error:', err);
    res.status(500).json({ error: 'Error al firmar documento' });
  }
});

// ─── VIEW ────────────────────────────────────────────────────────────────────
router.post('/:id/view', async (req, res) => {
  try {
    const { recipient_id } = req.body;

    if (recipient_id) {
      await sequelize.query(
        `UPDATE document_recipients
            SET status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
                viewed_at = COALESCE(viewed_at, NOW()),
                updated_at = NOW()
          WHERE id = ? AND document_id = ?`,
        { replacements: [recipient_id, req.params.id] }
      );
    }

    // Set viewed_at on document if first view
    await sequelize.query(
      `UPDATE documents SET viewed_at = COALESCE(viewed_at, NOW()), updated_at=NOW() WHERE id=?`,
      { replacements: [req.params.id] }
    );

    await logAudit(req.params.id, 'viewed', req.user.id, { ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    console.error('[documents] POST /:id/view error:', err);
    res.status(500).json({ error: 'Error al marcar como visto' });
  }
});

// ─── COMMENTS ────────────────────────────────────────────────────────────────
router.post('/:id/comments', async (req, res) => {
  try {
    const { comment, visibility } = req.body;
    if (!comment) return res.status(400).json({ error: 'El comentario es requerido' });

    const [result] = await sequelize.query(
      `INSERT INTO document_comments
         (document_id, user_id, comment, visibility, created_at)
       VALUES (?,?,?,?,NOW())`,
      {
        replacements: [
          req.params.id, req.user.id, comment,
          visibility || 'internal',
        ],
      }
    );

    const [[created]] = await sequelize.query(
      `SELECT dc.*, u.first_name, u.last_name
         FROM document_comments dc
         LEFT JOIN users u ON u.id = dc.user_id
        WHERE dc.id = ?`,
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[documents] POST /:id/comments error:', err);
    res.status(500).json({ error: 'Error al agregar comentario' });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT dc.*, u.first_name, u.last_name
         FROM document_comments dc
         LEFT JOIN users u ON u.id = dc.user_id
        WHERE dc.document_id = ?
        ORDER BY dc.created_at ASC`,
      { replacements: [req.params.id] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[documents] GET /:id/comments error:', err);
    res.status(500).json({ error: 'Error al listar comentarios' });
  }
});

// ─── AUDIT ───────────────────────────────────────────────────────────────────
router.get('/:id/audit', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT dal.*, u.first_name, u.last_name
         FROM document_audit_logs dal
         LEFT JOIN users u ON u.id = dal.performed_by
        WHERE dal.document_id = ?
        ORDER BY dal.created_at ASC`,
      { replacements: [req.params.id] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[documents] GET /:id/audit error:', err);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// ─── VERSIONS ────────────────────────────────────────────────────────────────
router.get('/:id/versions', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT dv.*, u.first_name, u.last_name
         FROM document_versions dv
         LEFT JOIN users u ON u.id = dv.created_by
        WHERE dv.document_id = ?
        ORDER BY dv.version_number DESC`,
      { replacements: [req.params.id] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[documents] GET /:id/versions error:', err);
    res.status(500).json({ error: 'Error al obtener versiones' });
  }
});

// ─── FOLDERS ─────────────────────────────────────────────────────────────────
router.get('/document-folders', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM document_folders ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('[documents] GET /document-folders error:', err);
    res.status(500).json({ error: 'Error al listar carpetas' });
  }
});

router.post('/document-folders', async (req, res) => {
  try {
    const { name, parent_id, description } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

    const [result] = await sequelize.query(
      `INSERT INTO document_folders (name, parent_id, description, created_by, created_at, updated_at)
       VALUES (?,?,?,?,NOW(),NOW())`,
      { replacements: [name, parent_id || null, description || null, req.user.id] }
    );

    const [[created]] = await sequelize.query(
      'SELECT * FROM document_folders WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[documents] POST /document-folders error:', err);
    res.status(500).json({ error: 'Error al crear carpeta' });
  }
});

// ─── Firma electrónica SHA-256 ────────────────────────────────────

// POST /api/documents/:id/sign-sha256 — firma con verificación de identidad y hash SHA-256
// Tipos soportados: PASSWORD, OTP (TOTP), DRAWN, IMAGE
// Cualquier usuario autenticado puede firmar sus propios documentos
router.post('/:id/sign-sha256', async (req, res) => {
  try {
    const { signDocument } = require('../services/signatureService');
    const result = await signDocument(req.params.id, req.user.id, req.body, req);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[documents] POST /:id/sign-sha256 error:', err);
    const status = err.message.includes('inválido') || err.message.includes('incorrecta') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/documents/:id/request-signature — solicitar firma de otro usuario
router.post('/:id/request-signature', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { requestSignature } = require('../services/signatureService');
    const { signer_id, signer_type, expires_in_hours } = req.body;
    if (!signer_id) return res.status(400).json({ error: 'signer_id es requerido' });
    const result = await requestSignature(req.params.id, signer_id, signer_type || 'employee', { expiresInHours: expires_in_hours || 72 });
    res.json(result);
  } catch (err) {
    console.error('[documents] POST /:id/request-signature error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/signatures — listar firmas con verificación de hash
router.get('/:id/signatures', async (req, res) => {
  try {
    const [sigs] = await sequelize.query(`
      SELECT ds.*, u.username, u.full_name AS signer_name
      FROM document_signatures ds
      LEFT JOIN users u ON u.id = ds.signer_user_id
      WHERE ds.document_id = ?
      ORDER BY ds.signed_at ASC
    `, { replacements: [req.params.id] });
    res.json(sigs);
  } catch (err) {
    const no = err.original?.errno ?? err.parent?.errno;
    if (no === 1146 || no === 1054) return res.json([]);
    console.error('[documents] GET /:id/signatures error:', err);
    res.status(500).json({ error: 'Error al obtener firmas' });
  }
});

// GET /api/documents/signatures/:sigId/verify — verificar integridad de firma
router.get('/signatures/:sigId/verify', async (req, res) => {
  try {
    const { verifySignature } = require('../services/signatureService');
    const result = await verifySignature(req.params.sigId);
    res.json(result);
  } catch (err) {
    console.error('[documents] GET /signatures/:sigId/verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
