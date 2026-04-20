/**
 * permissions.js
 * Workflow de 2 niveles + GTH final.
 * Transiciones controladas por permissionWorkflow.js.
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const wf = require('../services/permissionWorkflow');

router.use(authenticate);

// ─── GET /api/permissions ──────────────────────────────────────
// Listado filtrable por estado / empleado / departamento
router.get('/', async (req, res) => {
  const { status, approval_state, employeeId, department_id } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status)         { where += ' AND p.status = ?';           params.push(status); }
  if (approval_state) { where += ' AND p.approval_state = ?';   params.push(approval_state); }
  if (employeeId)     { where += ' AND p.employee_id = ?';      params.push(employeeId); }
  if (department_id)  { where += ' AND e.department_id = ?';    params.push(department_id); }

  const [rows] = await sequelize.query(`
    SELECT p.*,
      CONCAT(e.first_name,' ',e.last_name) AS employee_name,
      e.code AS employee_code,
      e.department_id,
      d.name AS department
    FROM permissions p
    JOIN employees e ON p.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 500
  `, { replacements: params });

  res.json(rows);
});

// ─── GET /api/permissions/inbox ─────────────────────────────────
// Bandeja del usuario actual (sólo los que le toca aprobar)
router.get('/inbox', async (req, res) => {
  try {
    const rows = await wf.getInboxFor(req.user);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/permissions/:id ──────────────────────────────────
router.get('/:id', async (req, res) => {
  const [[perm]] = await sequelize.query(`
    SELECT p.*,
      CONCAT(e.first_name,' ',e.last_name) AS employee_name,
      e.code AS employee_code,
      e.department_id,
      d.name AS department,
      u1.full_name AS level1_approver_name,
      u2.full_name AS level2_approver_name,
      uf.full_name AS final_approver_name
    FROM permissions p
    JOIN employees e ON p.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN users u1 ON p.level1_approver_id = u1.id
    LEFT JOIN users u2 ON p.level2_approver_id = u2.id
    LEFT JOIN users uf ON p.final_approver_id  = uf.id
    WHERE p.id = ?
  `, { replacements: [req.params.id] });

  if (!perm) return res.status(404).json({ error: 'Permiso no encontrado' });

  const [events] = await sequelize.query(`
    SELECT e.*, u.full_name AS actor_name, u.role AS actor_role
    FROM permission_approval_events e
    LEFT JOIN users u ON e.actor_id = u.id
    WHERE e.permission_id = ?
    ORDER BY e.created_at ASC
  `, { replacements: [req.params.id] });

  res.json({ ...perm, events });
});

// ─── POST /api/permissions ─────────────────────────────────────
// Crear solicitud. Resuelve regla y guarda needs_*.
router.post('/', async (req, res) => {
  const { employee_id, type, date_from, date_to, reason } = req.body;
  if (!employee_id || !type || !date_from || !date_to) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    const [[emp]] = await sequelize.query(
      'SELECT department_id FROM employees WHERE id = ?',
      { replacements: [employee_id] }
    );
    const department_id = emp?.department_id || null;

    const needs = await wf.computeNeedsForNewPermission({
      department_id, permission_type: type,
    });

    const [r] = await sequelize.query(
      `INSERT INTO permissions
         (employee_id, type, date_from, date_to, reason,
          approval_state, applied_rule_id,
          needs_level1, needs_level2, needs_final)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      { replacements: [
          employee_id, type, date_from, date_to, reason || null,
          needs.applied_rule_id,
          needs.needs_level1, needs.needs_level2, needs.needs_final,
      ]}
    );

    await wf.logEvent({
      permission_id: r.insertId, actor_id: req.user.id,
      from_state: 'n/a', to_state: 'pending',
      note: `Solicitud creada (tipo=${type})`,
    });

    res.status(201).json({ id: r.insertId, message: 'Permiso solicitado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH/PUT /api/permissions/:id/approve ───────────────────
// Avanza 1 paso en el workflow. Salta niveles no requeridos.
async function approveHandler(req, res) {
  const { note } = req.body || {};
  try {
    const [[perm]] = await sequelize.query(`
      SELECT p.*, e.department_id
      FROM permissions p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.id = ?
    `, { replacements: [req.params.id] });

    if (!perm) return res.status(404).json({ error: 'Permiso no encontrado' });

    if (!['pending','level1_ok','level2_ok'].includes(perm.approval_state)) {
      return res.status(409).json({ error: `No se puede aprobar en estado '${perm.approval_state}'` });
    }

    const allowed = await wf.canUserActOn(req.user, perm);
    if (!allowed) return res.status(403).json({ error: 'No autorizado a aprobar en este nivel' });

    const nextState = wf.nextApprovedState(perm.approval_state, {
      needs_level1: perm.needs_level1,
      needs_level2: perm.needs_level2,
      needs_final:  perm.needs_final,
    });
    if (!nextState) return res.status(409).json({ error: 'Sin transición posible' });

    // Determinar qué campos de aprobador llenar según la transición
    const fromState = perm.approval_state;
    const sets = [];
    const vals = [];

    if (fromState === 'pending') {
      sets.push('level1_approver_id = ?', 'level1_at = NOW()', 'level1_note = ?');
      vals.push(req.user.id, note || null);
    }
    if ((fromState === 'pending' && nextState === 'level2_ok') || fromState === 'level1_ok') {
      sets.push('level2_approver_id = ?', 'level2_at = NOW()', 'level2_note = ?');
      vals.push(req.user.id, note || null);
    }
    if (nextState === 'approved') {
      sets.push('final_approver_id = ?', 'final_at = NOW()', 'final_note = ?');
      vals.push(req.user.id, note || null);
      sets.push(`status = 'approved'`, `approved_by = ?`, `approved_at = NOW()`);
      vals.push(req.user.id);
    }
    sets.push('approval_state = ?');
    vals.push(nextState);
    vals.push(req.params.id);

    await sequelize.query(
      `UPDATE permissions SET ${sets.join(', ')} WHERE id = ?`,
      { replacements: vals }
    );

    await wf.logEvent({
      permission_id: perm.id, actor_id: req.user.id,
      from_state: fromState, to_state: nextState, note,
    });

    res.json({ message: 'Permiso aprobado', state: nextState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── PATCH/PUT /api/permissions/:id/reject ────────────────────
async function rejectHandler(req, res) {
  const { rejection_reason, reason, note } = req.body || {};
  const rejReason = rejection_reason || reason || note || null;

  try {
    const [[perm]] = await sequelize.query(`
      SELECT p.*, e.department_id
      FROM permissions p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.id = ?
    `, { replacements: [req.params.id] });

    if (!perm) return res.status(404).json({ error: 'Permiso no encontrado' });
    if (!['pending','level1_ok','level2_ok'].includes(perm.approval_state)) {
      return res.status(409).json({ error: `No se puede rechazar en estado '${perm.approval_state}'` });
    }
    const allowed = await wf.canUserActOn(req.user, perm);
    if (!allowed) return res.status(403).json({ error: 'No autorizado' });

    await sequelize.query(
      `UPDATE permissions
         SET approval_state = 'rejected',
             status         = 'rejected',
             approved_by    = ?,
             approved_at    = NOW(),
             rejection_reason = ?
       WHERE id = ?`,
      { replacements: [req.user.id, rejReason, req.params.id] }
    );

    await wf.logEvent({
      permission_id: perm.id, actor_id: req.user.id,
      from_state: perm.approval_state, to_state: 'rejected',
      note: rejReason,
    });

    res.json({ message: 'Permiso rechazado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.put('/:id/approve',   approveHandler);
router.patch('/:id/approve', approveHandler);
router.put('/:id/reject',    rejectHandler);
router.patch('/:id/reject',  rejectHandler);

// ─── POST /api/permissions/:id/cancel ─────────────────────────
// Cancela la propia solicitud (solo el solicitante o GTH/admin/super).
router.post('/:id/cancel', async (req, res) => {
  try {
    const [[perm]] = await sequelize.query(
      'SELECT p.*, e.department_id FROM permissions p JOIN employees e ON p.employee_id = e.id WHERE p.id = ?',
      { replacements: [req.params.id] }
    );
    if (!perm) return res.status(404).json({ error: 'No encontrado' });
    if (!['pending','level1_ok','level2_ok'].includes(perm.approval_state)) {
      return res.status(409).json({ error: 'Ya finalizó' });
    }

    const isOwner = req.user.employee_id && req.user.employee_id === perm.employee_id;
    const isPowerUser = ['super_admin','admin','gth'].includes(req.user.role);
    if (!isOwner && !isPowerUser) return res.status(403).json({ error: 'No autorizado' });

    await sequelize.query(
      `UPDATE permissions SET approval_state='cancelled', status='rejected' WHERE id=?`,
      { replacements: [req.params.id] }
    );
    await wf.logEvent({
      permission_id: perm.id, actor_id: req.user.id,
      from_state: perm.approval_state, to_state: 'cancelled',
    });
    res.json({ message: 'Cancelado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
