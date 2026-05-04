-- Fase 25: Evaluaciones de Desempeño
-- Plantillas reutilizables, criterios, instancias y puntajes

CREATE TABLE IF NOT EXISTS appraisal_templates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  description   TEXT,
  scale_min     TINYINT       NOT NULL DEFAULT 1,
  scale_max     TINYINT       NOT NULL DEFAULT 5,
  active        TINYINT(1)    NOT NULL DEFAULT 1,
  created_by    INT,
  created_at    DATETIME      NOT NULL DEFAULT NOW(),
  updated_at    DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appraisal_template_criteria (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  weight      DECIMAL(5,2) NOT NULL DEFAULT 1.00, -- peso relativo
  sort_order  INT          NOT NULL DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES appraisal_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Una evaluación = template + empleado + período
CREATE TABLE IF NOT EXISTS appraisals (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  template_id     INT           NOT NULL,
  employee_id     INT           NOT NULL,
  reviewer_id     INT,                           -- manager asignado (NULL = por definir)
  period_label    VARCHAR(60)   NOT NULL,         -- ej: "2025-S1", "2026-Q1"
  due_date        DATE,
  status          ENUM('draft','self_pending','manager_pending','hr_review','closed')
                  NOT NULL DEFAULT 'draft',
  -- puntuación final ponderada calculada al cerrar
  final_score     DECIMAL(5,2),
  hr_comment      TEXT,
  created_by      INT,
  created_at      DATETIME NOT NULL DEFAULT NOW(),
  closed_at       DATETIME,
  FOREIGN KEY (template_id)  REFERENCES appraisal_templates(id),
  FOREIGN KEY (employee_id)  REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id)  REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)   REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_appraisals_emp (employee_id),
  INDEX idx_appraisals_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Respuestas por criterio, separadas por rol (self / manager / hr)
CREATE TABLE IF NOT EXISTS appraisal_scores (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  appraisal_id INT NOT NULL,
  criteria_id  INT NOT NULL,
  scorer_role  ENUM('self','manager','hr') NOT NULL,
  score        TINYINT NOT NULL,               -- dentro del rango scale_min..scale_max
  comment      TEXT,
  scored_at    DATETIME NOT NULL DEFAULT NOW(),
  scored_by    INT,
  UNIQUE KEY uq_score (appraisal_id, criteria_id, scorer_role),
  FOREIGN KEY (appraisal_id) REFERENCES appraisals(id) ON DELETE CASCADE,
  FOREIGN KEY (criteria_id)  REFERENCES appraisal_template_criteria(id) ON DELETE CASCADE,
  FOREIGN KEY (scored_by)    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
