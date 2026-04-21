-- -------------------------------------------------------------
-- 013_twofa_and_password_reset.sql
-- 2FA TOTP: columnas en users para secreto y estado.
-- Password reset: tabla de tokens one-shot.
-- Compatible con MySQL 8.0 (procedure condicional para columnas).
-- -------------------------------------------------------------

-- 2FA en users (idempotente con procedure)
DROP PROCEDURE IF EXISTS mig_013_add_col;
DELIMITER $$
CREATE PROCEDURE mig_013_add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN defn TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @s = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN ', col, ' ', defn);
    PREPARE stmt FROM @s;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL mig_013_add_col('users', 'twofa_secret',     'VARCHAR(64) NULL');
CALL mig_013_add_col('users', 'twofa_enabled',    'TINYINT(1) NOT NULL DEFAULT 0');
CALL mig_013_add_col('users', 'twofa_enabled_at', 'TIMESTAMP NULL');

DROP PROCEDURE IF EXISTS mig_013_add_col;

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
