-- Competency management
CREATE TABLE IF NOT EXISTS competency_categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO competency_categories (company_id, name) VALUES
(1, 'Competencias Técnicas'),
(1, 'Competencias Conductuales'),
(1, 'Competencias de Liderazgo'),
(1, 'Competencias Administrativas');

CREATE TABLE IF NOT EXISTS competencies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  category_id BIGINT NOT NULL,
  code VARCHAR(30),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  competency_type ENUM('TECHNICAL','BEHAVIORAL','LEADERSHIP','CLINICAL','ADMINISTRATIVE') NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (category_id) REFERENCES competency_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_levels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  level_number TINYINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  UNIQUE KEY uq_level (company_id, level_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO competency_levels (company_id, level_number, name, description) VALUES
(1, 1, 'Inicial', 'Conocimiento básico, requiere supervisión constante'),
(1, 2, 'Básico', 'Comprende y aplica con supervisión'),
(1, 3, 'Operativo', 'Aplica de manera autónoma en situaciones habituales'),
(1, 4, 'Avanzado', 'Aplica en situaciones complejas y guía a otros'),
(1, 5, 'Experto', 'Referente, innova y lidera en el área');

CREATE TABLE IF NOT EXISTS position_competencies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  position_id BIGINT NOT NULL,
  competency_id BIGINT NOT NULL,
  required_level TINYINT NOT NULL DEFAULT 3,
  weight DECIMAL(5,2) DEFAULT 1.00,
  mandatory TINYINT(1) DEFAULT 1,
  status ENUM('active','inactive') DEFAULT 'active',
  UNIQUE KEY uq_pos_comp (position_id, competency_id),
  FOREIGN KEY (position_id) REFERENCES positions(id),
  FOREIGN KEY (competency_id) REFERENCES competencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS performance_cycles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(200) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status ENUM('draft','active','closed','archived') DEFAULT 'draft',
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_evaluations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  cycle_id BIGINT NOT NULL,
  employee_id INT NOT NULL,
  evaluator_user_id INT NULL,
  evaluator_type ENUM('SELF','MANAGER','PEER','SUBORDINATE','HR') NOT NULL,
  status ENUM('pending','in_progress','submitted','reviewed','final') DEFAULT 'pending',
  started_at DATETIME,
  submitted_at DATETIME,
  final_score DECIMAL(5,2),
  FOREIGN KEY (cycle_id) REFERENCES performance_cycles(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_evaluation_details (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  evaluation_id BIGINT NOT NULL,
  competency_id BIGINT NOT NULL,
  required_level TINYINT,
  evaluated_level TINYINT,
  score DECIMAL(5,2),
  evidence TEXT,
  comments TEXT,
  FOREIGN KEY (evaluation_id) REFERENCES competency_evaluations(id),
  FOREIGN KEY (competency_id) REFERENCES competencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_gaps (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  competency_id BIGINT NOT NULL,
  required_level TINYINT NOT NULL,
  current_level TINYINT NOT NULL,
  gap TINYINT NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_evaluation_id BIGINT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (competency_id) REFERENCES competencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS development_plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  cycle_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('draft','active','in_progress','completed','cancelled') DEFAULT 'draft',
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS development_plan_actions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  development_plan_id BIGINT NOT NULL,
  competency_id BIGINT NULL,
  action_type ENUM('TRAINING','MENTORING','ON_THE_JOB','CERTIFICATION','PROJECT','READING') NOT NULL,
  description TEXT NOT NULL,
  due_date DATE,
  responsible_user_id INT NULL,
  status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
  completion_evidence_document_id BIGINT NULL,
  completed_at DATETIME NULL,
  FOREIGN KEY (development_plan_id) REFERENCES development_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Training catalog
CREATE TABLE IF NOT EXISTS training_catalog (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  provider VARCHAR(200),
  modality ENUM('PRESENCIAL','VIRTUAL','MIXTO','E_LEARNING') DEFAULT 'PRESENCIAL',
  duration_hours DECIMAL(6,2) DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS training_competencies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  training_id BIGINT NOT NULL,
  competency_id BIGINT NOT NULL,
  target_level TINYINT,
  FOREIGN KEY (training_id) REFERENCES training_catalog(id),
  FOREIGN KEY (competency_id) REFERENCES competencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_trainings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  training_id BIGINT NOT NULL,
  enrollment_date DATE,
  start_date DATE,
  completion_date DATE,
  result ENUM('PENDING','PASSED','FAILED','WITHDRAWN') DEFAULT 'PENDING',
  score DECIMAL(5,2),
  certificate_document_id BIGINT NULL,
  status ENUM('enrolled','in_progress','completed','cancelled') DEFAULT 'enrolled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (training_id) REFERENCES training_catalog(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
