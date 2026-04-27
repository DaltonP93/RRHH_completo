-- Migración 023: notas/observaciones por empleado (timeline de RRHH)
-- Permite documentar observaciones, llamadas de atención, reconocimientos, etc.

CREATE TABLE IF NOT EXISTS employee_notes (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  employee_id   INT NOT NULL,
  author_id     INT NULL,
  type          ENUM('observation','warning','recognition','medical','training','other')
                NOT NULL DEFAULT 'observation',
  visibility    ENUM('hr_only','managers','employee') NOT NULL DEFAULT 'hr_only',
  title         VARCHAR(150) NOT NULL,
  body          TEXT,
  pinned        TINYINT(1) NOT NULL DEFAULT 0,
  attachment_url VARCHAR(255) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id)   REFERENCES users(id)     ON DELETE SET NULL,
  INDEX idx_emp_date (employee_id, created_at),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
