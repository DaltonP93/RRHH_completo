'use strict';
/**
 * dayApproval.js — Aprobación de jornada para nómina.
 *
 * Endpoints:
 *   PUT /api/attendance/day-approval/:employee_id/:date/approve
 *   PUT /api/attendance/day-approval/:employee_id/:date/reopen
 *
 * Invariante: attendance_logs NUNCA se modifica.
 */

const router        = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const logger        = require('../config/logger');
const { BLOCKING_ANOMALY_TYPES } = require('../services/attendanceProcessor');

router.use(authenticate);

const APPROVER_ROLES = ['admin', 'super_admin', 'hr', 'manager'];

function validateParams(req, res) {
  const employeeId = +req.params.employee_id;
  const date = req.params.date;
  if (!employeeId || isNaN(employeeId) || employeeId <= 0) {
    res.status(400).json({ ok: false, error: 'employee_id debe ser un entero positivo' });
    return null;
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ ok: false, error: 'date debe tener formato YYYY-MM-DD' });
    return null;
  }
  return { employeeId, date };
}

// ─── PUT /:employee_id/:date/approve ────────────────────────────────────────
router.put('/:employee_id/:date/approve', authorize(...APPROVER_ROLES), async (req, res) => {
  const params = validateParams(req, res);
  if (!params) return;
  const { employeeId, date } = params;

  try {
    // 1. Verificar que exista daily_summary
    const [[summary]] = await sequelize.query(
      'SELECT id, calculation_status, requires_review FROM daily_summary WHERE employee_id = ? AND date = ?',
      { replacements: [employeeId, date] }
    );
    if (!summary) {
      return res.status(404).json({ ok: false, error: 'No existe resumen diario para este empleado y fecha' });
    }
    if (summary.calculation_status === 'approved') {
      return res.status(409).json({ ok: false, error: 'La jornada ya está aprobada para nómina' });
    }

    // 2. Verificar anomalías bloqueantes sin resolver.
    //    Solo los tipos de integridad de datos / violación de política bloquean
    //    la nómina (BLOCKING_ANOMALY_TYPES). Las advisory (long_shift,
    //    duplicate_nearby) son informativas y no impiden la aprobación.
    const blockingPlaceholders = BLOCKING_ANOMALY_TYPES.map(() => '?').join(',');
    const [[anomalyCount]] = await sequelize.query(`
      SELECT COUNT(*) AS cnt FROM attendance_anomalies
      WHERE employee_id = ? AND work_date = ? AND resolved = 0
        AND anomaly_type IN (${blockingPlaceholders})
    `, { replacements: [employeeId, date, ...BLOCKING_ANOMALY_TYPES] });
    if (anomalyCount.cnt > 0) {
      return res.status(422).json({
        ok: false,
        error: `Hay ${anomalyCount.cnt} anomalía(s) bloqueante(s) sin resolver. Resuelva todas antes de aprobar.`,
        unresolved_anomalies: anomalyCount.cnt,
      });
    }

    // 3. Verificar ajustes pendientes
    const [[pendingCount]] = await sequelize.query(`
      SELECT COUNT(*) AS cnt FROM attendance_adjustments
      WHERE employee_id = ? AND work_date = ? AND status = 'pending'
    `, { replacements: [employeeId, date] });
    if (pendingCount.cnt > 0) {
      return res.status(422).json({
        ok: false,
        error: `Hay ${pendingCount.cnt} ajuste(s) pendiente(s). Apruebe o rechace todos antes de aprobar la jornada.`,
        pending_adjustments: pendingCount.cnt,
      });
    }

    // 4. Aprobar
    await sequelize.query(`
      UPDATE daily_summary
      SET calculation_status = 'approved',
          requires_review = 0,
          approved_by = ?,
          approved_at = NOW()
      WHERE employee_id = ? AND date = ?
    `, { replacements: [req.user.id, employeeId, date] });

    logger.info('day-approval: approved', { employee_id: employeeId, date, approved_by: req.user.id });
    res.json({ ok: true, message: 'Jornada aprobada para nómina', calculation_status: 'approved' });
  } catch (err) {
    logger.error('day-approval approve:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /:employee_id/:date/reopen ─────────────────────────────────────────
router.put('/:employee_id/:date/reopen', authorize(...APPROVER_ROLES), async (req, res) => {
  const params = validateParams(req, res);
  if (!params) return;
  const { employeeId, date } = params;
  const { reason } = req.body || {};

  try {
    const [[summary]] = await sequelize.query(
      'SELECT id, calculation_status FROM daily_summary WHERE employee_id = ? AND date = ?',
      { replacements: [employeeId, date] }
    );
    if (!summary) {
      return res.status(404).json({ ok: false, error: 'No existe resumen diario para este empleado y fecha' });
    }
    if (summary.calculation_status !== 'approved') {
      return res.status(409).json({ ok: false, error: 'La jornada no está aprobada — no se puede reabrir' });
    }

    // Determinar estado destino: si hay ajustes aprobados → 'adjusted', sino → 'provisional'
    const [[adjCount]] = await sequelize.query(`
      SELECT COUNT(*) AS cnt FROM attendance_adjustments
      WHERE employee_id = ? AND work_date = ? AND status = 'approved'
    `, { replacements: [employeeId, date] });
    const newStatus = adjCount.cnt > 0 ? 'adjusted' : 'provisional';

    await sequelize.query(`
      UPDATE daily_summary
      SET calculation_status = ?,
          requires_review = 1,
          approved_by = NULL,
          approved_at = NULL,
          notes = CONCAT(IFNULL(notes,''), ?)
      WHERE employee_id = ? AND date = ?
    `, { replacements: [
      newStatus,
      ` [Reabierta ${new Date().toISOString().slice(0,16)} por user#${req.user.id}${reason ? ': ' + reason : ''}]`,
      employeeId,
      date,
    ] });

    logger.info('day-approval: reopened', { employee_id: employeeId, date, reopened_by: req.user.id, new_status: newStatus });
    res.json({ ok: true, message: 'Jornada reabierta', calculation_status: newStatus });
  } catch (err) {
    logger.error('day-approval reopen:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
