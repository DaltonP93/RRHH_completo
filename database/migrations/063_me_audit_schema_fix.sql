-- ─── Migración 063: Audit / Me endpoint schema fix ───────────────────────────
-- Crea audit_events y user_permissions; agrega columnas de perfil a users.
-- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.
-- Sin transacciones: DDL de MySQL hace auto-commit.

-- ─── audit_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NULL,
  action       VARCHAR(120) NOT NULL,
  entity_type  VARCHAR(80) NULL,
  entity_id    BIGINT NULL,
  company_id   INT NULL,
  ip_address   VARCHAR(45) NULL,
  user_agent   TEXT NULL,
  details_json TEXT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ae_user    (user_id),
  INDEX idx_ae_action  (action),
  INDEX idx_ae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── user_permissions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_permissions (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  module_code  VARCHAR(80) NOT NULL,
  can_view     TINYINT(1) DEFAULT 0,
  can_create   TINYINT(1) DEFAULT 0,
  can_update   TINYINT(1) DEFAULT 0,
  can_delete   TINYINT(1) DEFAULT 0,
  can_export   TINYINT(1) DEFAULT 0,
  company_id   INT NULL,
  UNIQUE KEY uk_up (user_id, module_code, company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Columnas de perfil en users ─────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_id    INT          NULL,
  ADD COLUMN IF NOT EXISTS department_id INT          NULL,
  ADD COLUMN IF NOT EXISTS branch_id     INT          NULL,
  ADD COLUMN IF NOT EXISTS display_name  VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS avatar_url    VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS phone         VARCHAR(50)  NULL;
