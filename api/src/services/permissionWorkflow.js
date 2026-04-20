/**
 * permissionWorkflow.js
 * Lógica del flujo de aprobación de permisos a 2 niveles + GTH final.
 *
 * Estados:
 *   pending     — recién creado, esperando nivel 1 (coordinador)
 *   level1_ok   — aprobado por coordinador, esperando nivel 2 (manager)
 *   level2_ok   — aprobado por manager, esperando GTH final
 *   approved    — aprobación final completa
 *   rejected    — rechazado en cualquier nivel
 *   cancelled   — cancelado por el solicitante
 *
 * Transiciones permitidas:
 *   pending    → level1_ok | rejected | cancelled
 *   level1_ok  → level2_ok | rejected
 *   level2_ok  → approved  | rejected
 *
 * Si la regla resuelta marca un nivel como NO requerido, se saltea
 * automáticamente al llegar a ese estado.
 */

const { sequelize } = require('../config/database');

/**
 * Resuelve la regla aplicable: más específica (departamento+tipo) gana.
 */
async function resolveRule({ department_id, permission_type }) {
  const [rows] = await sequelize.query(`
    SELECT * FROM permission_approval_rules
    WHERE active = 1
      AND (department_id = ? OR department_id IS NULL)
      AND (permission_type = ? OR permission_type IS NULL)
    ORDER BY
      (department_id IS NOT NULL) DESC,
      (permission_type IS NOT NULL) DESC,
      id ASC
    LIMIT 1
  `, { replacements: [department_id || null, permission_type || null] });

  if (rows.length) return rows[0];

  // Fallback razonable si no hay ninguna regla configurada
  return {
    id: null,
    requires_coordinator: 1,
    requires_manager: 1,
    requires_gth_final: 1,
    self_approve_max_days: 0,
  };
}

/**
 * Devuelve el próximo estado al aprobar desde `currentState`, saltando
 * niveles no requeridos.
 */
function nextApprovedState(currentState, needs) {
  // needs = { needs_level1, needs_level2, needs_final }
  const path = ['pending', 'level1_ok', 'level2_ok', 'approved'];
  let i = path.indexOf(currentState);
  if (i < 0 || i === path.length - 1) return null;

  // Desde pending: si no requiere level1 saltamos; si tampoco level2 saltamos; si tampoco final directo approved.
  i++;
  while (i < path.length) {
    if (path[i] === 'level1_ok' && !needs.needs_level1) { i++; continue; }
    if (path[i] === 'level2_ok' && !needs.needs_level2) { i++; continue; }
    if (path[i] === 'approved'  && !needs.needs_final)  { return 'approved'; }
    return path[i];
  }
  return 'approved';
}

/**
 * Rol requerido para aprobar desde `state`.
 * - pending    → coordinator (o manager si no hay coord)
 * - level1_ok  → manager
 * - level2_ok  → admin/gth (GTH final)
 */
function roleForState(state) {
  switch (state) {
    case 'pending':   return { level: 1, roles: ['coordinator'] };
    case 'level1_ok': return { level: 2, roles: ['manager'] };
    case 'level2_ok': return { level: 3, roles: ['admin', 'gth'] };
    default:          return null;
  }
}

/**
 * ¿Puede `user` aprobar/rechazar este permiso en su estado actual?
 * Valida rol + asignación al departamento del empleado (para lvl 1 y 2).
 * super_admin y admin/gth pueden actuar en cualquier nivel.
 */
async function canUserActOn(user, permission) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;

  const need = roleForState(permission.approval_state);
  if (!need) return false;

  // GTH/admin siempre pueden actuar (pueden destrabar cualquier nivel)
  if (['admin', 'gth'].includes(user.role)) return true;

  // Para nivel 1/2 necesitamos validar que el user sea coord/manager del departamento
  const [[dept]] = await sequelize.query(
    'SELECT coordinator_id, manager_id FROM departments WHERE id = ?',
    { replacements: [permission.department_id] }
  );
  if (!dept) return false;

  if (need.level === 1 && dept.coordinator_id === user.id && user.role === 'coordinator') return true;
  if (need.level === 2 && dept.manager_id     === user.id && user.role === 'manager')     return true;
  return false;
}

/**
 * Calcula los flags needs_* y applied_rule_id al crear un permiso.
 */
async function computeNeedsForNewPermission({ department_id, permission_type }) {
  const rule = await resolveRule({ department_id, permission_type });
  return {
    applied_rule_id: rule.id,
    needs_level1:   rule.requires_coordinator ? 1 : 0,
    needs_level2:   rule.requires_manager     ? 1 : 0,
    needs_final:    rule.requires_gth_final   ? 1 : 0,
    self_approve_max_days: rule.self_approve_max_days,
  };
}

/**
 * Registra evento en el audit log (best effort).
 */
async function logEvent({ permission_id, actor_id, from_state, to_state, note }) {
  try {
    await sequelize.query(
      `INSERT INTO permission_approval_events
         (permission_id, actor_id, from_state, to_state, note)
       VALUES (?,?,?,?,?)`,
      { replacements: [permission_id, actor_id || null, from_state, to_state, note || null] }
    );
  } catch { /* tabla puede no existir aún en upgrades parciales */ }
}

/**
 * Obtiene la bandeja de aprobaciones pendientes para un usuario dado.
 * Devuelve los permisos donde ese usuario es el próximo aprobador.
 */
async function getInboxFor(user) {
  if (!user) return [];

  // super_admin / admin / gth → ven TODO lo pendiente en cualquier nivel
  if (['super_admin', 'admin', 'gth'].includes(user.role)) {
    const [rows] = await sequelize.query(`
      SELECT p.*,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        e.code AS employee_code,
        e.department_id,
        d.name AS department
      FROM permissions p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE p.approval_state IN ('pending','level1_ok','level2_ok')
      ORDER BY p.created_at ASC
      LIMIT 500
    `);
    return rows;
  }

  // coordinator → pendientes (nivel 1) de los deptos donde es coordinador
  if (user.role === 'coordinator') {
    const [rows] = await sequelize.query(`
      SELECT p.*,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        e.code AS employee_code,
        e.department_id,
        d.name AS department
      FROM permissions p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE d.coordinator_id = ?
        AND p.approval_state = 'pending'
        AND p.needs_level1 = 1
      ORDER BY p.created_at ASC
      LIMIT 500
    `, { replacements: [user.id] });
    return rows;
  }

  // manager → nivel 2 (level1_ok) de sus deptos
  if (user.role === 'manager') {
    const [rows] = await sequelize.query(`
      SELECT p.*,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name,
        e.code AS employee_code,
        e.department_id,
        d.name AS department
      FROM permissions p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE d.manager_id = ?
        AND p.approval_state = 'level1_ok'
        AND p.needs_level2 = 1
      ORDER BY p.created_at ASC
      LIMIT 500
    `, { replacements: [user.id] });
    return rows;
  }

  return [];
}

module.exports = {
  resolveRule,
  computeNeedsForNewPermission,
  nextApprovedState,
  roleForState,
  canUserActOn,
  logEvent,
  getInboxFor,
};
