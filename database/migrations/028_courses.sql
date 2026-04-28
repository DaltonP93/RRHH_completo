-- Migración 028: capacitaciones / cursos con tracking de asignación y completitud

CREATE TABLE IF NOT EXISTS courses (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  title           VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  category        VARCHAR(80) NULL,                              -- ej: 'seguridad', 'compliance', 'onboarding'
  duration_hours  DECIMAL(5,2) NULL,
  mandatory       TINYINT(1) NOT NULL DEFAULT 0,
  valid_until     DATE NULL,                                     -- vencimiento del curso (re-certificación)
  resource_url    VARCHAR(500) NULL,                             -- link a video, PDF, LMS externo
  active          TINYINT(1) NOT NULL DEFAULT 1,
  created_by      INT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_assignments (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  course_id       INT NOT NULL,
  employee_id     INT NOT NULL,
  assigned_by     INT NULL,
  assigned_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date        DATE NULL,
  completed_at    DATETIME NULL,
  score           DECIMAL(5,2) NULL,
  certificate_url VARCHAR(500) NULL,
  notes           VARCHAR(500) NULL,
  FOREIGN KEY (course_id)   REFERENCES courses(id)   ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id)     ON DELETE SET NULL,
  UNIQUE KEY uniq_course_emp (course_id, employee_id),
  INDEX idx_emp_status (employee_id, completed_at),
  INDEX idx_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
