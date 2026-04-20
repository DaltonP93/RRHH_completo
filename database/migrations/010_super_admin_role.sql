-- -------------------------------------------------------------
-- 010_super_admin_role.sql
-- Agrega rol `super_admin` y promueve el usuario `admin` inicial.
--
-- Jerarquía de roles:
--   super_admin  → Control total: relojes, BD, sincronización, todo.
--                  NO es visible al usuario normal (es rol técnico).
--   admin/gth    → Gestión de Talento Humano: empleados, permisos, reportes.
--                  No ve configuración de relojes ni BD.
--   coordinator  → Jefe de área: aprueba permisos de su depto (nivel 1).
--   manager      → Gerente: aprueba permisos (nivel 2).
--   hr           → RRHH (ahora alias de admin/gth).
--   supervisor   → Legacy, mantener compatibilidad.
--   gestor       → Legacy, mantener compatibilidad.
--   employee     → Portal self-service: ver marcajes, solicitar permisos.
-- -------------------------------------------------------------

-- 1. Extender ENUM
ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'super_admin','admin','gth','coordinator','manager',
    'gestor','hr','supervisor','employee'
  ) NOT NULL DEFAULT 'employee';

-- 2. Promover el admin inicial (username='admin') a super_admin
UPDATE users SET role = 'super_admin' WHERE username = 'admin';

-- 3. Verificación
SELECT id, username, role, full_name, active FROM users ORDER BY role, username;
