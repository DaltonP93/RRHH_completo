/**
 * processing.js — Módulo de procesamiento de horas
 * Restringido a super_admin. Recalcula daily_summary sobre un rango.
 */
const router = require('express').Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { recomputeRange } = require('../services/processing');
const { sequelize } = require('../config/database');
const logger = require('../config/logger');
const socketServer = require('../socket/socketServer');

router.use(authenticate, requireSuperAdmin);

// GET /api/processing/preview?dateFrom=&dateTo=&employeeIds=1,2
// Devuelve cuántos pares (empleado, día) se procesarían.
router.get('/preview', async (req, res) => {
  const { dateFrom, dateTo, employeeIds } = req.query;
  if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom y dateTo requeridos' });

  let where = 'DATE(al.timestamp) BETWEEN ? AND ?';
  const replacements = [dateFrom, dateTo];
  if (employeeIds) {
    const ids = String(employeeIds).split(',').map(s => parseInt(s.trim())).filter(Boolean);
    if (ids.length) {
      where += ` AND al.employee_id IN (${ids.map(() => '?').join(',')})`;
      replacements.push(...ids);
    }
  }

  try {
    const [[row]] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT al.employee_id, DATE(al.timestamp)) AS pairs,
        COUNT(DISTINCT al.employee_id) AS employees,
        COUNT(*) AS logs
      FROM attendance_logs al
      WHERE ${where}
    `, { replacements });
    res.json({ ok: true, ...row, dateFrom, dateTo });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/processing/recompute
// Body: { dateFrom, dateTo, employeeIds?: number[] }
// Respuesta inmediata con jobId; progreso por Socket.io 'processing:progress'.
router.post('/recompute', async (req, res) => {
  const { dateFrom, dateTo, employeeIds } = req.body || {};
  if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom y dateTo requeridos' });

  const jobId = `rc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let io = null;
  try { io = socketServer.getIO(); } catch {}

  // Responder inmediatamente — el job corre en background y emite progreso.
  res.json({ ok: true, jobId, message: 'Procesamiento iniciado', dateFrom, dateTo });

  recomputeRange({ dateFrom, dateTo, employeeIds, jobId, io })
    .then(result => logger.info(`[processing:${jobId}] OK — ${JSON.stringify(result)}`))
    .catch(err => {
      logger.error(`[processing:${jobId}] FAIL — ${err.message}`);
      if (io) io.emit('processing:progress', { jobId, stage: 'error', error: err.message });
    });
});

module.exports = router;
