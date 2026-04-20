-- -------------------------------------------------------------
-- 012_audit_events.sql
-- Tabla genérica de auditoría del sistema (logins, cambios de
-- configuración, acciones sensibles). Complementa la auditoría
-- específica del workflow de permisos (permission_approval_events).
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_events (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      INT NULL,
  username     VARCHAR(100) NULL,   -- snapshot, sobrevive borrado del user
  action       VARCHAR(80)  NOT NULL, -- 'login_ok' | 'login_fail' | 'settings_update' | 'permission_create' | ...
  entity       VARCHAR(80)  NULL,     -- 'user' | 'permission' | 'settings' | ...
  entity_id    VARCHAR(80)  NULL,
  ip           VARCHAR(45)  NULL,
  user_agent   VARCHAR(255) NULL,
  details      TEXT NULL,             -- JSON libre
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_action (action),
  INDEX idx_user (user_id),
  INDEX idx_created (created_at),
  INDEX idx_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verificación
SELECT 'audit_events OK' AS status, COUNT(*) AS rows_now FROM audit_events;
