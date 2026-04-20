-- -------------------------------------------------------------
-- 013_twofa_and_password_reset.sql
-- 2FA TOTP: columnas en users para secreto y estado.
-- Password reset: tabla de tokens one-shot.
-- -------------------------------------------------------------

-- 2FA en users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twofa_secret     VARCHAR(64)  NULL,
  ADD COLUMN IF NOT EXISTS twofa_enabled    TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS twofa_enabled_at TIMESTAMP    NULL;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT NOT NULL,
  token_hash  VARCHAR(128) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP NULL,
  ip          VARCHAR(45) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_expires (expires_at),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'fase6 ok' AS status,
  (SELECT COUNT(*) FROM users WHERE twofa_enabled = 1) AS users_with_2fa;
