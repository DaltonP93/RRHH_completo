-- Migración 018: Permisos granulares por usuario (override del rol)
--
-- Cada fila = (usuario, módulo) con 4 flags CRUD.
-- Si un usuario NO tiene filas → se aplica el comportamiento heredado por rol.
-- Si tiene filas → el backend y la UI usan estas flags.
-- super_admin/admin siempre tienen todo habilitado (no chequean esta tabla).

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     INT NOT NULL,
  module      VARCHAR(40) NOT NULL,   -- dashboard, empleados, asistencia, permisos,
                                      -- aprobaciones, reportes, ejecutivo, nomina,
                                      -- supervisor, departamentos, usuarios,
                                      -- auditoria, configuracion, sistema,
                                      -- mi_asistencia, mis_permisos, marcar, mi_perfil
  can_view    TINYINT(1) NOT NULL DEFAULT 0,
  can_create  TINYINT(1) NOT NULL DEFAULT 0,
  can_update  TINYINT(1) NOT NULL DEFAULT 0,
  can_delete  TINYINT(1) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, module),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
