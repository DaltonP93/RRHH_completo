-- Migración 027: comunicados internos broadcast con confirmación de lectura

CREATE TABLE IF NOT EXISTS announcements (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  title         VARCHAR(200) NOT NULL,
  body          TEXT NOT NULL,
  audience      ENUM('all','department','role','employees') NOT NULL DEFAULT 'all',
  audience_dept INT NULL,
  audience_role VARCHAR(20) NULL,
  audience_emps JSON NULL,                                    -- array de employee_ids cuando audience='employees'
  priority      ENUM('info','important','critical') NOT NULL DEFAULT 'info',
  require_ack   TINYINT(1) NOT NULL DEFAULT 0,                -- requiere confirmación de lectura
  pinned        TINYINT(1) NOT NULL DEFAULT 0,
  expires_at    DATETIME NULL,
  created_by    INT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by)    REFERENCES users(id),
  FOREIGN KEY (audience_dept) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_pinned (pinned, created_at),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INT NOT NULL,
  user_id         INT NOT NULL,
  read_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (announcement_id, user_id),
  FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
