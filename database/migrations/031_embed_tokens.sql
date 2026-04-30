-- Migración 031: tokens de embed para dashboards públicos read-only
-- Permite generar URLs sin auth para insertar widgets en intranets, Oracle APEX, etc.

CREATE TABLE IF NOT EXISTS embed_tokens (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  token         VARCHAR(80) UNIQUE NOT NULL,
  name          VARCHAR(150) NOT NULL,
  scope         JSON NOT NULL,                    -- {"widgets":["kpis","late","absent"], "deptId":3}
  expires_at    DATETIME NULL,
  last_used_at  DATETIME NULL,
  use_count     INT NOT NULL DEFAULT 0,
  created_by    INT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_token (token),
  INDEX idx_active (active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
