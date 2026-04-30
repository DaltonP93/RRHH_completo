/**
 * audit.js — consulta de auditoría con búsqueda FULLTEXT y export PDF firmado.
 * Sólo admin / gth / super_admin pueden leer.
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate, authorize('admin', 'gth'), requirePermission('auditoria', 'view'));

function buildFilter(q) {
  const { action, user_id, entity, q: search, fulltext, from, to } = q;
  let where = 'WHERE 1=1';
  const params = [];
  if (action)   { where += ' AND a.action = ?';        params.push(action); }
  if (user_id)  { where += ' AND a.user_id = ?';       params.push(user_id); }
  if (entity)   { where += ' AND a.entity = ?';        params.push(entity); }
  if (fulltext) {
    // FULLTEXT MATCH/AGAINST (boolean mode)
    where += ' AND MATCH(a.action, a.entity, a.details, a.username) AGAINST (? IN BOOLEAN MODE)';
    params.push(fulltext);
  } else if (search) {
    where += ' AND (a.username LIKE ? OR u.full_name LIKE ? OR a.details LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (from) { where += ' AND a.created_at >= ?';   params.push(from + ' 00:00:00'); }
  if (to)   { where += ' AND a.created_at <= ?';   params.push(to + ' 23:59:59'); }
  return { where, params };
}

// GET /api/audit?action=&user_id=&entity=&q=&from=&to=&limit=&offset=
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 200, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { where, params } = buildFilter(req.query);

  try {
    const [rows] = await sequelize.query(`
      SELECT a.id, a.user_id, a.username, a.action, a.entity, a.entity_id,
             a.ip, a.user_agent, a.details, a.created_at,
             u.full_name AS actor_name, u.role AS actor_role
      FROM audit_events a
      LEFT JOIN users u ON a.user_id = u.id
      ${where}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `, { replacements: [...params, limit, offset] });
    const [[{ total }]] = await sequelize.query(`
      SELECT COUNT(*) AS total FROM audit_events a LEFT JOIN users u ON a.user_id = u.id ${where}
    `, { replacements: params });
    res.json({ rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/export.csv — descarga CSV con los mismos filtros
router.get('/export.csv', async (req, res) => {
  const { where, params } = buildFilter(req.query);
  try {
    const [rows] = await sequelize.query(`
      SELECT a.id, a.created_at, a.action, a.entity, a.entity_id,
             COALESCE(u.full_name, a.username) AS user, u.role, a.ip, a.details
      FROM audit_events a LEFT JOIN users u ON a.user_id = u.id
      ${where} ORDER BY a.id DESC LIMIT 10000
    `, { replacements: params });
    const headers = ['id','created_at','action','entity','entity_id','user','role','ip','details'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const out = [headers.join(';'), ...rows.map(r => headers.map(h => esc(r[h])).join(';'))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_${Date.now()}.csv"`);
    res.send('\uFEFF' + out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/entities — listado de entidades distintas
router.get('/entities', async (_req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT entity, COUNT(*) AS total FROM audit_events WHERE entity IS NOT NULL AND entity <> '' GROUP BY entity ORDER BY total DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/actions — listado de acciones distintas (para el filtro)
router.get('/actions', async (_req, res) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT action, COUNT(*) AS total FROM audit_events GROUP BY action ORDER BY total DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/export.pdf — export PDF firmado digitalmente
router.get('/export.pdf', async (req, res) => {
  const { where, params } = buildFilter(req.query);
  try {
    const [rows] = await sequelize.query(`
      SELECT a.id, a.created_at, a.action, a.entity, a.entity_id,
             COALESCE(u.full_name, a.username) AS user_name, u.role, a.ip, a.details
      FROM audit_events a LEFT JOIN users u ON a.user_id = u.id
      ${where} ORDER BY a.id DESC LIMIT 2000
    `, { replacements: params });

    // Leer configuración de firma digital desde settings
    const [sigRows] = await sequelize.query(
      "SELECT key_name AS k, value AS v FROM notification_settings WHERE key_name IN ('system_signature_url','system_signer_name','system_signer_position','system_seal_url','system_name')"
    );
    const sig = {};
    for (const r of sigRows) sig[r.k] = r.v;

    const PDFDocument = require('pdfkit');
    const fs          = require('fs');
    const path        = require('path');
    const UPLOAD_DIR  = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

    const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_${Date.now()}.pdf"`);
    doc.pipe(res);

    // ── Encabezado ──────────────────────────────────────────────
    const orgName = sig.system_name || 'Sistema de Asistencia';
    doc.fontSize(16).fillColor('#0f172a').font('Helvetica-Bold').text(orgName, { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#475569').text('Registro de Auditoría', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#94a3b8').text(
      `Generado: ${new Date().toLocaleString('es-PY')} · ${rows.length} evento(s) · Filtros: ${JSON.stringify(req.query)}`,
      { align: 'center' }
    );
    doc.moveDown(1);

    // ── Tabla ────────────────────────────────────────────────────
    const COL = { id: 40, date: 100, action: 90, entity: 80, user: 100, ip: 75, details: 0 };
    const PAGE_W = doc.page.width - 80;
    COL.details = PAGE_W - COL.id - COL.date - COL.action - COL.entity - COL.user - COL.ip;

    const drawRow = (cols, isHeader = false) => {
      const y0 = doc.y;
      let x = 40;
      const fontSize = isHeader ? 7.5 : 7;
      const color    = isHeader ? '#f8fafc' : '#1e293b';
      const bg       = isHeader ? '#334155' : null;
      const rowH     = 16;
      if (bg) {
        doc.save().rect(40, y0, PAGE_W, rowH).fill(bg).restore();
      } else if (cols._even) {
        doc.save().rect(40, y0, PAGE_W, rowH).fill('#f1f5f9').restore();
      }
      doc.fontSize(fontSize).fillColor(isHeader ? '#fff' : color).font(isHeader ? 'Helvetica-Bold' : 'Helvetica');
      Object.entries(COL).forEach(([key, w]) => {
        if (key === '_even') return;
        const text = String(cols[key] || '').substring(0, key === 'details' ? 120 : 30);
        doc.text(text, x + 2, y0 + 4, { width: w - 4, lineBreak: false, ellipsis: true });
        x += w;
      });
      doc.y = y0 + rowH;
      doc.x = 40;
    };

    drawRow({ id: 'ID', date: 'Fecha/Hora', action: 'Acción', entity: 'Entidad', user: 'Usuario', ip: 'IP', details: 'Detalle' }, true);

    rows.forEach((r, i) => {
      if (doc.y > doc.page.height - 120) { doc.addPage(); }
      drawRow({
        _even: i % 2 === 1,
        id: r.id,
        date: r.created_at ? new Date(r.created_at).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '',
        action: r.action,
        entity: r.entity || '',
        user: r.user_name || '',
        ip: r.ip || '',
        details: typeof r.details === 'string' ? r.details : JSON.stringify(r.details || ''),
      });
    });

    // ── Firma digital ────────────────────────────────────────────
    doc.moveDown(2);
    const sigY = doc.y;

    const signerName  = sig.system_signer_name     || '';
    const signerPos   = sig.system_signer_position  || '';

    // Logo firma (si existe)
    const sigPath = sig.system_signature_url
      ? path.join(UPLOAD_DIR, path.basename(sig.system_signature_url))
      : null;
    if (sigPath && fs.existsSync(sigPath)) {
      doc.image(sigPath, 40, sigY, { height: 40 });
    } else {
      doc.moveTo(40, sigY + 40).lineTo(200, sigY + 40).stroke('#94a3b8');
    }

    // Sello (si existe)
    const sealPath = sig.system_seal_url
      ? path.join(UPLOAD_DIR, path.basename(sig.system_seal_url))
      : null;
    if (sealPath && fs.existsSync(sealPath)) {
      doc.image(sealPath, 160, sigY - 10, { height: 60, opacity: 0.7 });
    }

    doc.fontSize(8).fillColor('#334155').font('Helvetica-Bold')
      .text(signerName, 40, sigY + 45, { width: 200 });
    if (signerPos) doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text(signerPos, 40, doc.y);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-PY')}`, 40, doc.y + 2);

    // Hash SHA-256 del contenido (prueba de integridad)
    const crypto  = require('crypto');
    const content = rows.map(r => `${r.id}|${r.created_at}|${r.action}|${r.entity}|${r.user_name}`).join('\n');
    const hash    = crypto.createHash('sha256').update(content).digest('hex');
    doc.fontSize(6.5).fillColor('#94a3b8')
      .text(`SHA-256: ${hash}`, 40, doc.page.height - 45, { width: PAGE_W });

    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
