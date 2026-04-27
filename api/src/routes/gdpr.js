/**
 * gdpr.js — Cumplimiento GDPR / "right to be forgotten" + portabilidad de datos.
 *
 * GET  /api/gdpr/export/:employeeId       → ZIP/JSON con TODA la data del empleado
 * POST /api/gdpr/anonymize/:employeeId    → reemplaza PII con valores genéricos
 *                                           manteniendo integridad referencial
 *
 * Solo accesible para admin y super_admin (acción muy sensible).
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const audit = require('../services/audit');

router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// ─── GET /export/:employeeId — exportar TODA la data del empleado ────
router.get('/export/:employeeId', async (req, res) => {
  const empId = parseInt(req.params.employeeId, 10);
  try {
    const [[employee]] = await sequelize.query(
      'SELECT * FROM employees WHERE id = ?', { replacements: [empId] }
    );
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

    // Recolectar tablas relacionadas
    const queries = [
      ['attendance_logs',  'SELECT * FROM attendance_logs WHERE employee_id = ? ORDER BY timestamp DESC'],
      ['daily_summary',    'SELECT * FROM daily_summary   WHERE employee_id = ? ORDER BY date DESC'],
      ['permissions',      'SELECT * FROM permissions     WHERE employee_id = ? ORDER BY created_at DESC'],
    ];
    const data = { employee, exported_at: new Date().toISOString(), exported_by: req.user.username || req.user.id };
    for (const [key, sql] of queries) {
      try {
        const [rows] = await sequelize.query(sql, { replacements: [empId] });
        data[key] = rows;
      } catch { data[key] = []; }
    }
    // Tablas opcionales (pueden no existir en instalaciones viejas)
    const optional = [
      ['employee_notes',   'SELECT * FROM employee_notes  WHERE employee_id = ? ORDER BY created_at DESC'],
      ['user_record',      'SELECT id, username, email, role, created_at, last_login FROM users WHERE employee_id = ?'],
    ];
    for (const [key, sql] of optional) {
      try {
        const [rows] = await sequelize.query(sql, { replacements: [empId] });
        data[key] = rows;
      } catch { /* tabla no existe */ }
    }

    // Log de auditoría
    await sequelize.query(
      'INSERT INTO gdpr_exports (employee_id, requested_by, scope, reason) VALUES (?, ?, ?, ?)',
      { replacements: [empId, req.user.id, 'full', req.query.reason || null] }
    );
    audit.log({ actor_id: req.user.id, action: 'gdpr.export', entity: 'employee', entity_id: empId,
                metadata: { scope: 'full' } }).catch(() => {});

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="gdpr_export_${empId}_${new Date().toISOString().slice(0,10)}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /anonymize/:employeeId — anonimizar PII ──────────────────
router.post('/anonymize/:employeeId',
  authorize('admin', 'super_admin'),
  async (req, res) => {
    const empId = parseInt(req.params.employeeId, 10);
    const { confirm } = req.body || {};
    if (confirm !== 'ANONIMIZAR') {
      return res.status(400).json({
        error: 'Confirmación requerida: enviá { confirm: "ANONIMIZAR" } en el body',
      });
    }

    try {
      const [[employee]] = await sequelize.query(
        'SELECT id, code, anonymized_at FROM employees WHERE id = ?', { replacements: [empId] }
      );
      if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });
      if (employee.anonymized_at) {
        return res.status(409).json({ error: 'Empleado ya anonimizado' });
      }

      const placeholder = `ANON_${empId}`;

      // 1) Reemplazar PII en employees
      await sequelize.query(`
        UPDATE employees SET
          first_name      = ?,
          last_name       = ?,
          email           = NULL,
          phone           = NULL,
          employee_number = NULL,
          birth_date      = NULL,
          photo_url       = NULL,
          status          = 'inactive',
          anonymized_at   = NOW(),
          anonymized_by   = ?
        WHERE id = ?
      `, { replacements: ['Usuario', `Anónimo #${empId}`, req.user.id, empId] });

      // 2) Si tiene usuario vinculado, anonimizar credenciales (mantiene FK)
      try {
        await sequelize.query(`
          UPDATE users SET
            username = CONCAT('anon_', ?),
            email    = CONCAT('anon_', ?, '@anonimizado.local'),
            full_name = 'Usuario Anónimo',
            password_hash = NULL,
            twofa_secret  = NULL,
            twofa_enabled = 0
          WHERE employee_id = ?
        `, { replacements: [empId, empId, empId] });
      } catch { /* sin tabla users link */ }

      // 3) Limpiar notas con visibility employee (datos personales)
      try {
        await sequelize.query(
          "DELETE FROM employee_notes WHERE employee_id = ? AND visibility = 'employee'",
          { replacements: [empId] }
        );
      } catch { /* tabla no existe */ }

      // 4) Limpiar selfies en attendance_logs (PII visual)
      try {
        await sequelize.query(
          'UPDATE attendance_logs SET selfie_url = NULL WHERE employee_id = ? AND selfie_url IS NOT NULL',
          { replacements: [empId] }
        );
      } catch { /* columna no existe */ }

      audit.log({ actor_id: req.user.id, action: 'gdpr.anonymize', entity: 'employee', entity_id: empId,
                  metadata: { code: employee.code, placeholder } }).catch(() => {});

      res.json({
        ok: true,
        message: 'Empleado anonimizado. Los datos históricos (asistencia, permisos) se conservan vinculados al ID anónimo.',
        placeholder,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/gdpr/exports — historial de exportaciones (auditoría)
router.get('/exports', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        x.id, x.employee_id, x.export_date, x.scope, x.reason,
        u.username AS requested_by_username, u.full_name AS requested_by_name,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.code
      FROM gdpr_exports x
      JOIN users u     ON u.id = x.requested_by
      JOIN employees e ON e.id = x.employee_id
      ORDER BY x.export_date DESC
      LIMIT 200
    `);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
