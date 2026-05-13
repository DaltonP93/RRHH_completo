'use strict';
/**
 * documentTemplates.js — CRUD for document templates.
 *
 * GET    /api/document-templates              list with filters
 * POST   /api/document-templates              create
 * GET    /api/document-templates/variables    available dynamic variables
 * GET    /api/document-templates/:id          detail
 * PUT    /api/document-templates/:id          update (increments version)
 * DELETE /api/document-templates/:id          soft delete (status=deprecated)
 * POST   /api/document-templates/:id/clone    clone with new name
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);
router.use(authorize('admin', 'hr', 'gth', 'super_admin'));

// ─── Available dynamic variables ────────────────────────────────────────────
const AVAILABLE_VARIABLES = {
  employee:  ['full_name', 'document_number', 'position', 'hire_date', 'base_salary'],
  company:   ['legal_name', 'ruc', 'trade_name'],
  payroll:   ['period', 'net_pay', 'gross_income'],
  vacation:  ['start_date', 'end_date', 'total_days'],
  leave:     ['reason', 'start_date', 'end_date'],
  signature: ['employee', 'hr'],
  date:      ['today'],
};

// NOTE: this route must be declared BEFORE /:id so Express matches it first
router.get('/variables', (_req, res) => {
  res.json(AVAILABLE_VARIABLES);
});

// ─── LIST ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { module, status, company_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (module)     { where += ' AND dt.module = ?';     params.push(module); }
    if (status)     { where += ' AND dt.status = ?';     params.push(status); }
    if (company_id) { where += ' AND dt.company_id = ?'; params.push(Number(company_id)); }

    const [rows] = await sequelize.query(
      `SELECT dt.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name
         FROM document_templates dt
         LEFT JOIN users u ON u.id = dt.created_by
       ${where}
       ORDER BY dt.updated_at DESC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[documentTemplates] GET / error:', err);
    res.status(500).json({ error: 'Error al listar plantillas' });
  }
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      name, code, module, html_template, canvas_json,
      dynamic_fields_schema, description, company_id,
    } = req.body;

    if (!name || !module) {
      return res.status(400).json({ error: 'name y module son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO document_templates
         (name, code, module, html_template, canvas_json, dynamic_fields_schema,
          description, company_id, status, version, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,'active',1,?,NOW(),NOW())`,
      {
        replacements: [
          name, code || null, module,
          html_template || null,
          canvas_json ? JSON.stringify(canvas_json) : null,
          dynamic_fields_schema ? JSON.stringify(dynamic_fields_schema) : null,
          description || null,
          company_id || null,
          req.user.id,
        ],
      }
    );

    const [[created]] = await sequelize.query(
      'SELECT * FROM document_templates WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[documentTemplates] POST / error:', err);
    if (err.original?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una plantilla con ese código' });
    }
    res.status(500).json({ error: 'Error al crear plantilla' });
  }
});

// ─── DETAIL ──────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await sequelize.query(
      `SELECT dt.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name
         FROM document_templates dt
         LEFT JOIN users u ON u.id = dt.created_by
        WHERE dt.id = ?`,
      { replacements: [req.params.id] }
    );
    if (!row) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json(row);
  } catch (err) {
    console.error('[documentTemplates] GET /:id error:', err);
    res.status(500).json({ error: 'Error al obtener plantilla' });
  }
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT * FROM document_templates WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (existing.status === 'deprecated') {
      return res.status(400).json({ error: 'No se puede editar una plantilla deprecada' });
    }

    const {
      name, code, module, html_template, canvas_json,
      dynamic_fields_schema, description, status,
    } = req.body;

    await sequelize.query(
      `UPDATE document_templates SET
         name                  = COALESCE(?, name),
         code                  = COALESCE(?, code),
         module                = COALESCE(?, module),
         html_template         = COALESCE(?, html_template),
         canvas_json           = COALESCE(?, canvas_json),
         dynamic_fields_schema = COALESCE(?, dynamic_fields_schema),
         description           = COALESCE(?, description),
         status                = COALESCE(?, status),
         version               = version + 1,
         updated_by            = ?,
         updated_at            = NOW()
       WHERE id = ?`,
      {
        replacements: [
          name || null, code || null, module || null,
          html_template || null,
          canvas_json ? JSON.stringify(canvas_json) : null,
          dynamic_fields_schema ? JSON.stringify(dynamic_fields_schema) : null,
          description || null,
          status || null,
          req.user.id,
          req.params.id,
        ],
      }
    );

    const [[updated]] = await sequelize.query(
      'SELECT * FROM document_templates WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json(updated);
  } catch (err) {
    console.error('[documentTemplates] PUT /:id error:', err);
    res.status(500).json({ error: 'Error al actualizar plantilla' });
  }
});

// ─── SOFT DELETE (deprecate) ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM document_templates WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Plantilla no encontrada' });

    await sequelize.query(
      `UPDATE document_templates SET status='deprecated', updated_by=?, updated_at=NOW() WHERE id=?`,
      { replacements: [req.user.id, req.params.id] }
    );
    res.json({ message: 'Plantilla marcada como deprecada' });
  } catch (err) {
    console.error('[documentTemplates] DELETE /:id error:', err);
    res.status(500).json({ error: 'Error al deprecar plantilla' });
  }
});

// ─── CLONE ───────────────────────────────────────────────────────────────────
router.post('/:id/clone', async (req, res) => {
  try {
    const [[source]] = await sequelize.query(
      'SELECT * FROM document_templates WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!source) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const newName = req.body.name || `${source.name} (copia)`;
    const newCode = req.body.code || null;

    const [result] = await sequelize.query(
      `INSERT INTO document_templates
         (name, code, module, html_template, canvas_json, dynamic_fields_schema,
          description, company_id, status, version, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,'active',1,?,NOW(),NOW())`,
      {
        replacements: [
          newName, newCode, source.module,
          source.html_template, source.canvas_json,
          source.dynamic_fields_schema, source.description,
          source.company_id, req.user.id,
        ],
      }
    );

    const [[cloned]] = await sequelize.query(
      'SELECT * FROM document_templates WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(cloned);
  } catch (err) {
    console.error('[documentTemplates] POST /:id/clone error:', err);
    res.status(500).json({ error: 'Error al clonar plantilla' });
  }
});

module.exports = router;
