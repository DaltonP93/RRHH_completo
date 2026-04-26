/**
 * backups.js — endpoints para gestión de backups manuales y descarga.
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../middleware/auth');
const { BACKUP_DIR, runBackup, listBackups, purgeOldBackups } = require('../services/backups');

router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// GET /api/backups — listado de backups disponibles
router.get('/', async (_req, res) => {
  try {
    const files = await listBackups();
    res.json({ ok: true, backups: files, retention_days: parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backups — generar backup manual
router.post('/', async (_req, res) => {
  try {
    const result = await runBackup();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backups/purge — borrar backups viejos según retención
router.post('/purge', async (_req, res) => {
  try {
    const removed = await purgeOldBackups();
    res.json({ ok: true, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups/:filename — descargar archivo
router.get('/:filename', async (req, res) => {
  const f = req.params.filename;
  if (!/^asistencia_.*\.sql\.gz$/.test(f)) return res.status(400).json({ error: 'Nombre inválido' });
  const fp = path.join(BACKUP_DIR, f);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Backup no encontrado' });
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${f}"`);
  fs.createReadStream(fp).pipe(res);
});

// DELETE /api/backups/:filename
router.delete('/:filename', async (req, res) => {
  const f = req.params.filename;
  if (!/^asistencia_.*\.sql\.gz$/.test(f)) return res.status(400).json({ error: 'Nombre inválido' });
  const fp = path.join(BACKUP_DIR, f);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Backup no encontrado' });
  try { fs.unlinkSync(fp); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
