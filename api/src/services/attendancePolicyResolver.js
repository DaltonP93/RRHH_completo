'use strict';
/**
 * attendancePolicyResolver.js
 * Resuelve la política de jornada efectiva para un empleado dado.
 *
 * Orden de prioridad (más específico primero):
 *   1. employee   — política asignada directamente al empleado
 *   2. department — política del departamento del empleado
 *   3. branch     — política de la sucursal
 *   4. company    — política de la empresa
 *   5. global     — política global (scope_type='global')
 *   6. DEFAULT    — constante segura si no hay nada configurado
 */

const { sequelize } = require('../config/database');

const DEFAULT_POLICY = Object.freeze({
  id:                        null,
  name:                      'Default (sin política configurada)',
  scope_type:                'default',
  scope_id:                  null,
  auto_deduct_break:         false,
  break_minutes:             0,
  apply_break_after_minutes: 0,
  require_lunch_punch:       false,
  allow_continuous_shift:    true,
  max_daily_minutes:         720,
  min_daily_minutes:         0,
  source:                    'default',
});

let _tableExists = null;

async function _policiesTableExists() {
  if (_tableExists !== null) return _tableExists;
  try {
    const [[row]] = await sequelize.query(
      "SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_work_policies'",
    );
    _tableExists = Boolean(row);
  } catch {
    _tableExists = false;
  }
  return _tableExists;
}

function _normalize(row, source) {
  if (!row) return null;
  return {
    id:                        row.id,
    name:                      row.name,
    scope_type:                row.scope_type,
    scope_id:                  row.scope_id,
    auto_deduct_break:         Boolean(row.auto_deduct_break),
    break_minutes:             row.break_minutes       || 0,
    apply_break_after_minutes: row.apply_break_after_minutes || 0,
    require_lunch_punch:       Boolean(row.require_lunch_punch),
    allow_continuous_shift:    row.allow_continuous_shift === undefined ? true : Boolean(row.allow_continuous_shift),
    max_daily_minutes:         row.max_daily_minutes   || 720,
    min_daily_minutes:         row.min_daily_minutes   || 0,
    source,
  };
}

/**
 * Resuelve la política efectiva para un empleado.
 * @param {number} employeeId
 * @returns {Promise<object>} política efectiva (nunca null)
 */
async function resolvePolicy(employeeId) {
  if (!(await _policiesTableExists())) return { ...DEFAULT_POLICY };

  // Obtener datos del empleado (department_id, branch_id)
  let deptId = null, branchId = null;
  try {
    const [[emp]] = await sequelize.query(
      'SELECT department_id, branch_id FROM employees WHERE id = ? LIMIT 1',
      { replacements: [employeeId] }
    );
    deptId   = emp?.department_id ?? null;
    branchId = emp?.branch_id     ?? null;
  } catch {
    // employees no tiene branch_id aún → ignorar
  }

  // Construir lista de condiciones a consultar, ordenadas de más a menos específico
  const conditions = [
    { scope: 'employee',   id: employeeId },
    { scope: 'department', id: deptId     },
    { scope: 'branch',     id: branchId   },
    { scope: 'company',    id: null       },
    { scope: 'global',     id: null       },
  ].filter(c => c.id !== null || c.scope === 'company' || c.scope === 'global');

  for (const { scope, id } of conditions) {
    try {
      const where = id !== null
        ? `scope_type = ? AND scope_id = ?`
        : `scope_type = ? AND scope_id IS NULL`;
      const params = id !== null ? [scope, id] : [scope];

      const [[row]] = await sequelize.query(
        `SELECT * FROM attendance_work_policies WHERE ${where} AND active = 1 ORDER BY id LIMIT 1`,
        { replacements: params }
      );
      if (row) return _normalize(row, scope);
    } catch {
      // tabla parcialmente disponible — seguir
    }
  }

  return { ...DEFAULT_POLICY };
}

/**
 * Lista todas las políticas activas con info de scope.
 */
async function listPolicies() {
  if (!(await _policiesTableExists())) return [];
  const [rows] = await sequelize.query(
    'SELECT * FROM attendance_work_policies ORDER BY scope_type, id'
  );
  return rows.map(r => _normalize(r, r.scope_type));
}

/**
 * Crea o actualiza una política.
 */
async function upsertPolicy(data) {
  const {
    id, name, scope_type, scope_id,
    auto_deduct_break = false, break_minutes = 0, apply_break_after_minutes = 0,
    require_lunch_punch = false, allow_continuous_shift = true,
    max_daily_minutes = 720, min_daily_minutes = 0, active = true,
  } = data;

  if (id) {
    await sequelize.query(`
      UPDATE attendance_work_policies SET
        name = ?, scope_type = ?, scope_id = ?,
        auto_deduct_break = ?, break_minutes = ?, apply_break_after_minutes = ?,
        require_lunch_punch = ?, allow_continuous_shift = ?,
        max_daily_minutes = ?, min_daily_minutes = ?, active = ?
      WHERE id = ?
    `, { replacements: [
      name, scope_type, scope_id ?? null,
      auto_deduct_break ? 1 : 0, break_minutes, apply_break_after_minutes,
      require_lunch_punch ? 1 : 0, allow_continuous_shift ? 1 : 0,
      max_daily_minutes, min_daily_minutes, active ? 1 : 0,
      id,
    ]});
    return id;
  }

  const [result] = await sequelize.query(`
    INSERT INTO attendance_work_policies
      (name, scope_type, scope_id, auto_deduct_break, break_minutes, apply_break_after_minutes,
       require_lunch_punch, allow_continuous_shift, max_daily_minutes, min_daily_minutes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, { replacements: [
    name, scope_type, scope_id ?? null,
    auto_deduct_break ? 1 : 0, break_minutes, apply_break_after_minutes,
    require_lunch_punch ? 1 : 0, allow_continuous_shift ? 1 : 0,
    max_daily_minutes, min_daily_minutes, active ? 1 : 0,
  ]});
  return result.insertId;
}

async function deletePolicy(id) {
  if (id === 1) throw new Error('No se puede eliminar la política global por defecto (id=1)');
  await sequelize.query('DELETE FROM attendance_work_policies WHERE id = ?', { replacements: [id] });
}

// Reset cache (useful for tests)
function _resetCache() { _tableExists = null; }

module.exports = { resolvePolicy, listPolicies, upsertPolicy, deletePolicy, DEFAULT_POLICY, _resetCache };
