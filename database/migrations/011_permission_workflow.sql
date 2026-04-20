-- -------------------------------------------------------------
-- 011_permission_workflow.sql
-- Flujo de aprobación de permisos a 2 niveles configurable por GTH.
--
-- Jerarquía de aprobación:
--   1. Empleado solicita (web o portal)       → state='pending'
--   2. Coordinador del departamento aprueba   → state='level1_ok'
--   3. Manager del departamento aprueba       → state='level2_ok'
--   4. GTH (admin) aprueba final              → state='approved'
--   En cualquier punto puede rechazarse       → state='rejected'
--
-- Las reglas (permission_approval_rules) definen por departamento (y
-- opcionalmente por tipo de permiso) si cada nivel es requerido o se
-- saltea, y si el empleado puede auto-aprobar X días para ciertos tipos.
-- -------------------------------------------------------------

-- 1. Departamentos: asignar coordinador y manager.
ALTER TABLE departments
  ADD COLUMN coordinator_id INT NULL AFTER manager_id,
  ADD CONSTRAINT fk_dept_coordinator FOREIGN KEY (coordinator_id) REFERENCES users(id) ON DELETE SET NULL;

-- Asegurar FK de manager_id (puede no existir en instalaciones viejas)
ALTER TABLE departments
  ADD CONSTRAINT fk_dept_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. Reglas de aprobación.
--    Si department_id es NULL → regla global (fallback).
--    Si type es NULL → aplica a cualquier tipo de permiso.
--    La regla más específica gana (departamento+tipo > departamento > global).
CREATE TABLE IF NOT EXISTS permission_approval_rules (
  id                      INT PRIMARY KEY AUTO_INCREMENT,
  department_id           INT NULL,
  permission_type         ENUM('vacation','sick','personal','maternity','paternity','study','legal','other') NULL,
  requires_coordinator    TINYINT(1) NOT NULL DEFAULT 1,
  requires_manager        TINYINT(1) NOT NULL DEFAULT 1,
  requires_gth_final      TINYINT(1) NOT NULL DEFAULT 1,
  self_approve_max_days   INT NOT NULL DEFAULT 0,
  notes                   VARCHAR(255) NULL,
  active                  TINYINT(1) NOT NULL DEFAULT 1,
  created_by              INT NULL,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)    REFERENCES users(id)       ON DELETE SET NULL,
  INDEX idx_rule_scope (department_id, permission_type, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Regla global por defecto (se aplica si no hay nada más específico)
INSERT INTO permission_approval_rules (department_id, permission_type, requires_coordinator, requires_manager, requires_gth_final, self_approve_max_days, notes)
VALUES (NULL, NULL, 1, 1, 1, 0, 'Regla por defecto — coordinador + manager + GTH');

-- 3. Permisos: extender con el estado del workflow.
ALTER TABLE permissions
  ADD COLUMN approval_state ENUM(
    'pending','level1_ok','level2_ok','approved','rejected','cancelled'
  ) NOT NULL DEFAULT 'pending' AFTER status,
  ADD COLUMN level1_approver_id INT NULL,
  ADD COLUMN level1_at          DATETIME NULL,
  ADD COLUMN level1_note        VARCHAR(255) NULL,
  ADD COLUMN level2_approver_id INT NULL,
  ADD COLUMN level2_at          DATETIME NULL,
  ADD COLUMN level2_note        VARCHAR(255) NULL,
  ADD COLUMN final_approver_id  INT NULL,
  ADD COLUMN final_at           DATETIME NULL,
  ADD COLUMN final_note         VARCHAR(255) NULL,
  ADD COLUMN applied_rule_id    INT NULL,
  ADD COLUMN needs_level1       TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN needs_level2       TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN needs_final        TINYINT(1) NOT NULL DEFAULT 1,
  ADD CONSTRAINT fk_perm_lvl1 FOREIGN KEY (level1_approver_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_perm_lvl2 FOREIGN KEY (level2_approver_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_perm_final FOREIGN KEY (final_approver_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_perm_rule  FOREIGN KEY (applied_rule_id)   REFERENCES permission_approval_rules(id) ON DELETE SET NULL,
  ADD INDEX idx_perm_state (approval_state);

-- 4. Backfill: los permisos existentes ya aprobados/rechazados van a estados finales.
UPDATE permissions SET approval_state = 'approved' WHERE status = 'approved';
UPDATE permissions SET approval_state = 'rejected' WHERE status = 'rejected';
UPDATE permissions SET approval_state = 'pending'  WHERE status = 'pending';

-- 5. Tabla de auditoría de transiciones (opcional pero recomendada)
CREATE TABLE IF NOT EXISTS permission_approval_events (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  permission_id INT NOT NULL,
  actor_id      INT NULL,
  from_state    VARCHAR(20) NOT NULL,
  to_state      VARCHAR(20) NOT NULL,
  note          VARCHAR(500) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id)      REFERENCES users(id)       ON DELETE SET NULL,
  INDEX idx_perm (permission_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Link users.employee_id (probablemente existe, pero asegurarse)
--    Si ya existe la columna, el ALTER fallará silenciosamente — ignorar.
-- (se maneja desde la app)

-- 7. Verificación
SELECT
  (SELECT COUNT(*) FROM permission_approval_rules) AS rules_count,
  (SELECT COUNT(*) FROM permissions)               AS permissions_count,
  (SELECT COUNT(DISTINCT approval_state) FROM permissions) AS distinct_states;
