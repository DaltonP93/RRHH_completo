-- Fase 26: Onboarding / Offboarding
-- Templates de checklist reutilizables + instancias por empleado

CREATE TABLE IF NOT EXISTS onboarding_templates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  type        ENUM('onboarding','offboarding') NOT NULL DEFAULT 'onboarding',
  description TEXT,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_by  INT,
  created_at  DATETIME     NOT NULL DEFAULT NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tareas dentro de un template
CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  template_id  INT          NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  -- a qué rol se asigna por defecto (IT, HR, manager, etc. — texto libre)
  default_assignee_role VARCHAR(60),
  due_days     INT          NOT NULL DEFAULT 3,  -- días desde fecha de inicio
  sort_order   INT          NOT NULL DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES onboarding_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Proceso de onboarding/offboarding para un empleado específico
CREATE TABLE IF NOT EXISTS onboarding_processes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  template_id  INT          NOT NULL,
  employee_id  INT          NOT NULL,
  type         ENUM('onboarding','offboarding') NOT NULL,
  start_date   DATE         NOT NULL,
  status       ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
  created_by   INT,
  created_at   DATETIME     NOT NULL DEFAULT NOW(),
  completed_at DATETIME,
  FOREIGN KEY (template_id)  REFERENCES onboarding_templates(id),
  FOREIGN KEY (employee_id)  REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)   REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ob_employee (employee_id),
  INDEX idx_ob_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tareas concretas de cada proceso
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  process_id   INT          NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  assignee_id  INT,          -- usuario responsable
  due_date     DATE,
  status       ENUM('pending','in_progress','done','skipped') NOT NULL DEFAULT 'pending',
  sort_order   INT          NOT NULL DEFAULT 0,
  completed_at DATETIME,
  completed_by INT,
  notes        TEXT,
  FOREIGN KEY (process_id)   REFERENCES onboarding_processes(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id)  REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_obt_process (process_id),
  INDEX idx_obt_assignee (assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
