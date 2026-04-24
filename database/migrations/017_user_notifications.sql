-- Migración 017: Inbox de notificaciones por usuario (in-app, no SMTP)

CREATE TABLE IF NOT EXISTS user_notifications (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT NOT NULL,
  type        VARCHAR(40) NOT NULL DEFAULT 'info',   -- info|permission|approval|alert|system
  title       VARCHAR(180) NOT NULL,
  body        TEXT NULL,
  link        VARCHAR(255) NULL,
  read_at     DATETIME NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_read (user_id, read_at),
  INDEX idx_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
