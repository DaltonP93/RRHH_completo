/**
 * overtimeBank.js — Banco de horas: acumulación y canje de horas extra.
 *
 * GET    /api/overtime-bank/summary                 → saldos de todos los empleados
 * GET    /api/overtime-bank/employee/:id            → saldo + transacciones del empleado
 * POST   /api/overtime-bank/deposit                 → acreditar horas
 * POST   /api/overtime-bank/redeem                  → canjear (descontar) horas
 * POST   /api/overtime-bank/sync-from-daily         → sumar overtime_minutes desde daily_summary
 */
const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// Helper: saldo actual del empleado
async function getBalance(employeeId) {
  const [[r]] = await sequelize.query(
    'SELECT COALESCE(SUM(minutes), 0) AS balance FROM overtime_transactions WHERE employee_id = ?',
    { replacements: [employeeId] }
  );
  return Number(r?.balance) || 0;
}

// GET /summary — saldos de todos los empleados activos
router.get('/summary',
  authorize('admin', 'gth', 'hr', 'manager', 'gestor', 'supervisor'),
  async (req, res) => {
    try {
      const deptId = req.query.deptId ? parseInt(req.query.deptId, 10) : null;
      const params = [];
      let deptFilter = '';
      if (deptId) { deptFilter = 'AND e.department_id = ?'; params.push(deptId); }

      const [rows] = await sequelize.query(`
        SELECT
          e.id, e.code,
          CONCAT(e.first_name,' ',e.last_name) AS employee_name,
          d.name AS department,
          COALESCE(SUM(ot.minutes), 0) AS balance_minutes,
          COALESCE(SUM(CASE WHEN ot.type = 'deposit' THEN ot.minutes ELSE 0 END), 0) AS total_deposited,
          COALESCE(SUM(CASE WHEN ot.type = 'redeem'  THEN ot.minutes ELSE 0 END), 0) AS total_redeemed,
          MAX(ot.created_at) AS last_activity
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN overtime_transactions ot ON ot.employee_id = e.id
        WHERE e.status = 'active' ${deptFilter}
        GROUP BY e.id
        ORDER BY balance_minutes DESC
      `, { replacements: params });

      res.json({ ok: true, count: rows.length, data: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// GET /employee/:id — saldo + historial
router.get('/employee/:id', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    // Si es employee, solo puede ver su propio saldo
    if (req.user?.role === 'employee') {
      const [[u]] = await sequelize.query(
        'SELECT employee_id FROM users WHERE id = ?',
        { replacements: [req.user.id] }
      );
      if (u?.employee_id !== empId) return res.status(403).json({ error: 'Sin permiso' });
    }

    const balance = await getBalance(empId);
    const [transactions] = await sequelize.query(`
      SELECT ot.*, u.username AS author_username, u.full_name AS author_name
      FROM overtime_transactions ot
      LEFT JOIN users u ON u.id = ot.created_by
      WHERE ot.employee_id = ?
      ORDER BY ot.created_at DESC
      LIMIT 200
    `, { replacements: [empId] });

    res.json({ ok: true, employee_id: empId, balance_minutes: balance, transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /deposit — acreditar horas extra al banco
router.post('/deposit',
  authorize('admin', 'gth', 'hr'),
  requirePermission('nomina', 'create'),
  async (req, res) => {
    const { employee_id, minutes, reference_date, reason } = req.body || {};
    if (!employee_id || !minutes || minutes <= 0) {
      return res.status(400).json({ error: 'employee_id y minutes (>0) son requeridos' });
    }
    try {
      const [r] = await sequelize.query(
        `INSERT INTO overtime_transactions (employee_id, type, minutes, reference_date, reason, created_by)
         VALUES (?, 'deposit', ?, ?, ?, ?)`,
        { replacements: [employee_id, +minutes, reference_date || null, reason || null, req.user.id] }
      );
      res.json({ ok: true, id: r, balance: await getBalance(employee_id) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// POST /redeem — canjear horas (descontar)
router.post('/redeem',
  authorize('admin', 'gth', 'hr', 'manager'),
  async (req, res) => {
    const { employee_id, minutes, permission_id, reason } = req.body || {};
    if (!employee_id || !minutes || minutes <= 0) {
      return res.status(400).json({ error: 'employee_id y minutes (>0) son requeridos' });
    }
    try {
      const balance = await getBalance(employee_id);
      if (balance < minutes) {
        return res.status(400).json({ error: `Saldo insuficiente (disponible: ${balance} min, solicitado: ${minutes} min)` });
      }
      const [r] = await sequelize.query(
        `INSERT INTO overtime_transactions (employee_id, type, minutes, reason, permission_id, created_by)
         VALUES (?, 'redeem', ?, ?, ?, ?)`,
        { replacements: [employee_id, -Math.abs(minutes), reason || null, permission_id || null, req.user.id] }
      );
      res.json({ ok: true, id: r, balance: await getBalance(employee_id) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// POST /sync-from-daily — depositar overtime_minutes pendientes desde daily_summary
// Acredita SOLO los días no procesados antes (idempotente: marca con reference_date único por empleado)
router.post('/sync-from-daily',
  authorize('admin', 'gth'),
  async (req, res) => {
    const { date_from, date_to } = req.body || {};
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'date_from y date_to son requeridos' });
    }
    try {
      // Cada (employee, date) que tenga overtime > 0 y no haya sido depositado aún
      const [rows] = await sequelize.query(`
        SELECT ds.employee_id, ds.date, ds.overtime_minutes
        FROM daily_summary ds
        LEFT JOIN overtime_transactions ot
          ON ot.employee_id = ds.employee_id
          AND ot.reference_date = ds.date
          AND ot.type = 'deposit'
        WHERE ds.date BETWEEN ? AND ?
          AND ds.overtime_minutes > 0
          AND ot.id IS NULL
      `, { replacements: [date_from, date_to] });

      let deposited = 0, totalMin = 0;
      for (const r of rows) {
        await sequelize.query(
          `INSERT INTO overtime_transactions (employee_id, type, minutes, reference_date, reason, created_by)
           VALUES (?, 'deposit', ?, ?, 'Auto-sync daily_summary', ?)`,
          { replacements: [r.employee_id, r.overtime_minutes, r.date, req.user.id] }
        );
        deposited++;
        totalMin += Number(r.overtime_minutes) || 0;
      }
      res.json({ ok: true, deposited, total_minutes: totalMin });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

module.exports = router;
