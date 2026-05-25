/**
 * hrSources.js
 * CRUD y ejecución de fuentes HR externas (ERP/HR APIs).
 */

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { runSync, reloadSchedule, stopSchedule } = require('../services/hrSourceSync');

router.use(authenticate, authorize('admin'));

// GET /api/hr-sources — listar todas
router.get('/', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT id, name, type, url, method, auth_type, schedule_cron, enabled, last_run_at, last_status, last_result, created_at FROM external_hr_sources ORDER BY id DESC'
    );
    res.json(rows);
  } catch {
    res.json([]);  // table may not exist yet
  }
});

// GET /api/hr-sources/:id — detalle
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await sequelize.query(
      'SELECT * FROM external_hr_sources WHERE id=?',
      { replacements: [req.params.id] }
    );
    if (!row) return res.status(404).json({ error: 'No encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr-sources — crear
router.post('/', async (req, res) => {
  const {
    name, type = 'http_json', url, method = 'GET',
    headers_json, body_json, auth_type = 'none', auth_token,
    json_root_path = '', field_mapping,
    schedule_cron, enabled = 1,
  } = req.body || {};

  if (!name || !url || !field_mapping) {
    return res.status(400).json({ error: 'name, url y field_mapping son requeridos' });
  }
  if (!field_mapping.code) {
    return res.status(400).json({ error: 'field_mapping.code es requerido (mapea el identificador del empleado)' });
  }

  try {
    const [id] = await sequelize.query(`
      INSERT INTO external_hr_sources
        (name, type, url, method, headers_json, body_json, auth_type, auth_token,
         json_root_path, field_mapping, schedule_cron, enabled)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      { replacements: [
        name, type, url, method,
        headers_json ? JSON.stringify(headers_json) : null,
        body_json    ? JSON.stringify(body_json)    : null,
        auth_type, auth_token || null,
        json_root_path,
        JSON.stringify(field_mapping),
        schedule_cron || null, enabled ? 1 : 0,
      ]}
    );
    if (schedule_cron && enabled) await reloadSchedule(id);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/hr-sources/:id — actualizar
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const {
    name, type, url, method,
    headers_json, body_json, auth_type, auth_token,
    json_root_path, field_mapping,
    schedule_cron, enabled,
  } = req.body || {};

  try {
    await sequelize.query(`
      UPDATE external_hr_sources SET
        name            = COALESCE(?, name),
        type            = COALESCE(?, type),
        url             = COALESCE(?, url),
        method          = COALESCE(?, method),
        headers_json    = ?,
        body_json       = ?,
        auth_type       = COALESCE(?, auth_type),
        auth_token      = ?,
        json_root_path  = COALESCE(?, json_root_path),
        field_mapping   = COALESCE(?, field_mapping),
        schedule_cron   = ?,
        enabled         = COALESCE(?, enabled)
      WHERE id = ?`,
      { replacements: [
        name ?? null, type ?? null, url ?? null, method ?? null,
        headers_json !== undefined ? (headers_json ? JSON.stringify(headers_json) : null) : null,
        body_json    !== undefined ? (body_json    ? JSON.stringify(body_json)    : null) : null,
        auth_type ?? null,
        auth_token !== undefined ? auth_token : null,
        json_root_path ?? null,
        field_mapping ? JSON.stringify(field_mapping) : null,
        schedule_cron !== undefined ? (schedule_cron || null) : null,
        enabled !== undefined ? (enabled ? 1 : 0) : null,
        id,
      ]}
    );
    await reloadSchedule(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hr-sources/:id
router.delete('/:id', async (req, res) => {
  try {
    stopSchedule(+req.params.id);
    await sequelize.query('DELETE FROM external_hr_sources WHERE id=?', { replacements: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr-sources/:id/run — ejecutar sync manual
router.post('/:id/run', async (req, res) => {
  try {
    const result = await runSync(+req.params.id);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/hr-sources/:id/test — fetch sin guardar (preview primeros 5)
router.post('/:id/test', async (req, res) => {
  try {
    const [[src]] = await sequelize.query('SELECT * FROM external_hr_sources WHERE id=?',
      { replacements: [req.params.id] });
    if (!src) return res.status(404).json({ error: 'No encontrada' });

    const headers = { 'Accept': 'application/json', ...(src.headers_json || {}) };
    if (src.auth_type === 'bearer' && src.auth_token) headers.Authorization = `Bearer ${src.auth_token}`;
    else if (src.auth_type === 'basic' && src.auth_token) headers.Authorization = `Basic ${Buffer.from(src.auth_token).toString('base64')}`;
    else if (src.auth_type === 'api_key' && src.auth_token) headers['X-API-Key'] = src.auth_token;

    const resp = await fetch(src.url, { method: src.method || 'GET', headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    let records = [];
    if (src.type === 'http_csv') {
      // reutilizar parser
      const { parseCSV } = { parseCSV: (text) => {
        const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
        if (!lines.length) return [];
        const sep = [',', ';', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
        const headers = lines[0].split(sep).map(h => h.trim());
        return lines.slice(1, 6).map(line => {
          const cols = line.split(sep);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
          return obj;
        });
      }};
      records = parseCSV(await resp.text());
    } else {
      const json = await resp.json();
      const getByPath = (obj, path) => !path ? obj : path.split('.').reduce((a, k) => a?.[k], obj);
      const arr = getByPath(json, src.json_root_path) ?? json;
      records = (Array.isArray(arr) ? arr : []).slice(0, 5);
    }
    res.json({ ok: true, sample: records, total_preview: records.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
