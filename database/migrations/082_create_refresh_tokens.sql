-- Migration 082: create refresh_tokens if not present (was only in init.sql)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED     NOT NULL,
  token_hash VARCHAR(64)      NOT NULL,
  expires_at DATETIME         NOT NULL,
  created_at DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id),
  KEY idx_refresh_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
