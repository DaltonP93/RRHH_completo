'use strict';
/**
 * manualAdjustments.js — Endpoints para revisión y corrección manual de marcaciones.
 *
 * Endpoints:
 *   GET  /api/attendance/manual-adjustments?date=YYYY-MM-DD&employee_id=N
 *   POST /api/attendance/manual-adjustments
 *   PUT  /api/attendance/manual-adjustments/:id/approve
 *   PUT  /api/attendance/manual-adjustments/:id/reject
 *
 * Invariante de inmutabilidad: attendance_logs NUNCA se modifica ni elimina.
 * Los ajustes aprobados de tipo add_punch crean un nuevo registro en attendance_logs.
 * Los ajustes aprobados de tipo exclude_from_calculation se respetan en el motor.
 */

const router        = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const logger        = require('../config/logger');

router.use(authenticate);

const ADJUSTMENT_TYPES = [
  'change_type',
  'add_punch',
  'exclude_from_calculation',
  'include_in_calculation',
  'change_time',
  'justify_missing_punch',
];

const REVIEWER_ROLES = ['admin', 'super_admin', 'hr', 'supervisor', 'manager'];

// ─── GET /api/attendance/manual-adjustments ───────────────────────────────────
router.get('/', authorize(...REVIEWER_ROLES), async (req, res) => {
  const { date, employee_id, status } = req.query;
  if (!date || !employee_id) {
    return res.status(400).json({ ok: false, error: 'date y employee_id son requeridos' });
  }
  try {
    let sql = `
      SELECT aa.*,
             CONCAT(req.first_name, ' ', req.last_name) AS requested_by_name,
             CONCAT(apr.first_name, ' ', apr.last_name) AS approved_by_name
      FROM attendance_adjustments aa
      LEFT JOIN employees req ON req.id = aa.requested_by
      LEFT JOIN employees apr ON apr.id = aa.approved_by
      WHERE aa.employee_id = ? AND aa.work_date = ?
    `;
    const replacements = [+employee_id, date];
    if (status) {
      sql += ' AND aa.status = ?';
      replacements.push(status);
    }
    sql += ' ORDER BY aa.created_at DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    const parsed = rows.map(r => ({
      ...r,
      old_value: typeof r.old_value === 'string' ? (() => { try { return JSON.parse(r.old_value); } catch { return r.old_value; } })() : r.old_value,
      new_value: typeof r.new_value === 'string' ? (() => { try { return JSON.parse(r.new_value); } catch { return r.new_value; } })() : r.new_value,
    }));
    res.json({ ok: true, adjustments: parsed });
  } catch (err) {
    logger.error('manual-adjustments GET:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/attendance/manual-adjustments ──────────────────────────────────
router.post('/', authorize(...REVIEWER_ROLES), async (req, res) => {
  const { employee_id, work_date, adjustment_type, original_log_id, old_value, new_value, reason } = req.body || {};

  if (!employee_id || !work_date || !adjustment_type) {
    return res.status(400).json({ ok: false, error: 'employee_id, work_date y adjustment_type son requeridos' });
  }
  if (!ADJUSTMENT_TYPES.includes(adjustment_type)) {
    return res.status(400).json({ ok: false, error: `adjustment_type inválido. Valores: ${ADJUSTMENT_TYPES.join(', ')}` });
  }

  // add_punch requiere new_value con timestamp y type
  if (adjustment_type === 'add_punch') {
    if (!new_value?.timestamp || !new_value?.type) {
      return res.status(400).json({ ok: false, error: 'add_punch requiere new_value.timestamp y new_value.type (in/out)' });
    }
    if (!['in', 'out'].includes(new_value.type)) {
      return res.status(400).json({ ok: false, error: 'new_value.type debe ser "in" o "out"' });
    }
  }

  // exclude_from_calculation y change_type requieren original_log_id
  if (['exclude_from_calculation', 'include_in_calculation', 'change_type', 'change_time'].includes(adjustment_type)) {
    if (!original_log_id) {
      return res.status(400).json({ ok: false, error: `${adjustment_type} requiere original_log_id` });
    }
  }

  try {
    const [result] = await sequelize.query(`
      INSERT INTO attendance_adjustments
        (employee_id, work_date, original_log_id, adjustment_type, old_value, new_value, reason, requested_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, { replacements: [
      +employee_id,
      work_date,
      original_log_id ? +original_log_id : null,
      adjustment_type,
      old_value ? JSON.stringify(old_value) : null,
      new_value ? JSON.stringify(new_value) : null,
      reason || null,
      req.user.id,
    ]});

    const insertId = typeof result === 'number' ? result : result.insertId;
    logger.info('manual-adjustment created', { id: insertId, employee_id, work_date, adjustment_type });
    res.status(201).json({ ok: true, id: insertId });
  } catch (err) {
    logger.error('manual-adjustments POST:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/attendance/manual-adjustments/:id/approve ───────────────────────
router.put('/:id/approve', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(+id) || +id <= 0) {
    return res.status(400).json({ ok: false, error: 'id debe ser un entero positivo' });
  }
  try {
    const [[adj]] = await sequelize.query(
      'SELECT * FROM attendance_adjustments WHERE id = ?',
      { replacements: [+id] }
    );
    if (!adj) return res.status(404).json({ ok: false, error: 'Ajuste no encontrado' });
    if (adj.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `El ajuste ya está en estado "${adj.status}"` });
    }

    // Prevenir que el solicitante se apruebe a sí mismo (excepto super_admin)
    if (req.user.role !== 'super_admin' && adj.requested_by === req.user.id) {
      return res.status(403).json({ ok: false, error: 'No puede aprobar su propio ajuste' });
    }

    const newValue = typeof adj.new_value === 'string'
      ? (() => { try { return JSON.parse(adj.new_value); } catch { return {}; } })()
      : (adj.new_value || {});

    // Ejecutar efecto según tipo
    if (adj.adjustment_type === 'add_punch') {
      // Crear nuevo registro en attendance_logs (nunca modificar existente)
      await sequelize.query(`
        INSERT INTO attendance_logs (employee_id, timestamp, type, source, device_id)
        VALUES (?, ?, ?, 'manual_adjustment', NULL)
      `, { replacements: [adj.employee_id, newValue.timestamp, newValue.type] });
      logger.info('add_punch: nuevo log creado', { employee_id: adj.employee_id, timestamp: newValue.timestamp });
    }

    if (adj.adjustment_type === 'justify_missing_punch') {
      // Marcar anomalía como resuelta
      await sequelize.query(`
        UPDATE attendance_anomalies
        SET resolved = 1
        WHERE employee_id = ? AND work_date = ? AND anomaly_type = 'missing_out' AND resolved = 0
      `, { replacements: [adj.employee_id, adj.work_date] });
    }

    // Persistir aprobación
    await sequelize.query(`
      UPDATE attendance_adjustments
      SET status = 'approved', approved_by = ?, approved_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, +id] });

    // Recalcular daily_summary respetando los ajustes aprobados
    const recalcTypes = ['add_punch', 'exclude_from_calculation', 'include_in_calculation', 'change_type', 'change_time'];
    if (recalcTypes.includes(adj.adjustment_type)) {
      try {
        const { processAttendanceDay } = require('../services/attendanceProcessor');
        await processAttendanceDay({ date: adj.work_date, employeeId: adj.employee_id });
        logger.info('recalculated after approval', { employee_id: adj.employee_id, date: adj.work_date });
      } catch (recalcErr) {
        logger.warn('recalc after approval failed (non-fatal):', recalcErr.message);
      }
    }

    res.json({ ok: true, message: 'Ajuste aprobado' });
  } catch (err) {
    logger.error('manual-adjustments approve:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/attendance/manual-adjustments/:id/reject ────────────────────────
router.put('/:id/reject', authorize('admin', 'super_admin', 'hr'), async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(+id) || +id <= 0) {
    return res.status(400).json({ ok: false, error: 'id debe ser un entero positivo' });
  }
  const { reason } = req.body || {};
  try {
    const [[adj]] = await sequelize.query(
      'SELECT * FROM attendance_adjustments WHERE id = ?',
      { replacements: [+id] }
    );
    if (!adj) return res.status(404).json({ ok: false, error: 'Ajuste no encontrado' });
    if (adj.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `El ajuste ya está en estado "${adj.status}"` });
    }

    const rejectReplacements = [req.user.id];
    let rejectSql = 'UPDATE attendance_adjustments SET status = \'rejected\', approved_by = ?, approved_at = NOW()';
    if (reason) {
      rejectSql += ', reason = CONCAT(IFNULL(reason,""), ?)';
      rejectReplacements.push(` [Rechazo: ${reason}]`);
    }
    rejectSql += ' WHERE id = ?';
    rejectReplacements.push(+id);
    await sequelize.query(rejectSql, { replacements: rejectReplacements });

    res.json({ ok: true, message: 'Ajuste rechazado' });
  } catch (err) {
    logger.error('manual-adjustments reject:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
