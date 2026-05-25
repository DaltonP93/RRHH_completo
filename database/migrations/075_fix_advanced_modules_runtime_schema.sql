-- 075_fix_advanced_modules_runtime_schema.sql
-- Crea idempotentemente tablas para módulos avanzados que faltan en staging.
-- Todas las sentencias usan IF NOT EXISTS o ON DUPLICATE KEY para ser re-ejecutables.

-- ─── Documentos ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_folders (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  parent_id   INT UNSIGNED NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_templates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  content         LONGTEXT,
  variables       JSON,
  category_id     INT UNSIGNED NULL,
  folder_id       INT UNSIGNED NULL,
  status          ENUM('active','inactive','deleted') DEFAULT 'active',
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Competencias ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS competency_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  status      ENUM('active','inactive') DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competencies (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category_id     INT UNSIGNED NULL,
  type            ENUM('technical','behavioral','leadership','generic') DEFAULT 'generic',
  status          ENUM('active','inactive','deleted') DEFAULT 'active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_levels (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  competency_id   INT UNSIGNED NOT NULL,
  level           TINYINT NOT NULL COMMENT '1-5',
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS position_competencies (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  position_id     INT UNSIGNED NOT NULL,
  competency_id   INT UNSIGNED NOT NULL,
  required_level  TINYINT DEFAULT 3,
  weight          DECIMAL(5,2) DEFAULT 1.00,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pos_comp (position_id, competency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Ciclos de desempeño y evaluaciones ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS performance_cycles (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          ENUM('draft','active','closed') DEFAULT 'draft',
  type            ENUM('annual','semester','quarterly','custom') DEFAULT 'annual',
  company_id      INT UNSIGNED NULL,
  created_by      INT UNSIGNED NULL,
  started_at      DATETIME NULL,
  closed_at       DATETIME NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_evaluations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_id        INT UNSIGNED NOT NULL,
  employee_id     INT UNSIGNED NOT NULL,
  evaluator_id    INT UNSIGNED NULL,
  type            ENUM('self','manager','peer','360') DEFAULT 'manager',
  status          ENUM('pending','in_progress','submitted','approved') DEFAULT 'pending',
  overall_score   DECIMAL(5,2) NULL,
  comments        TEXT,
  submitted_at    DATETIME NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_evaluation_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluation_id   INT UNSIGNED NOT NULL,
  competency_id   INT UNSIGNED NOT NULL,
  score           TINYINT NULL COMMENT '1-5',
  comments        TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Planes de desarrollo ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS development_plans (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT UNSIGNED NOT NULL,
  cycle_id        INT UNSIGNED NULL,
  title           VARCHAR(200) NOT NULL,
  objectives      TEXT,
  status          ENUM('draft','active','completed','cancelled') DEFAULT 'draft',
  due_date        DATE NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS development_plan_actions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id         INT UNSIGNED NOT NULL,
  description     VARCHAR(500) NOT NULL,
  type            ENUM('training','mentoring','project','reading','other') DEFAULT 'other',
  status          ENUM('pending','in_progress','completed') DEFAULT 'pending',
  due_date        DATE NULL,
  completed_at    DATETIME NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Catálogo de formación ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_catalog (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  provider        VARCHAR(150),
  duration_hours  DECIMAL(6,2) DEFAULT 0,
  modality        ENUM('online','presential','blended','self_paced') DEFAULT 'presential',
  cost            DECIMAL(12,2) DEFAULT 0,
  currency        CHAR(3) DEFAULT 'PYG',
  status          ENUM('active','inactive','deleted') DEFAULT 'active',
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_trainings (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT UNSIGNED NOT NULL,
  training_id     INT UNSIGNED NULL,
  name            VARCHAR(200) NOT NULL,
  status          ENUM('planned','in_progress','completed','cancelled') DEFAULT 'planned',
  start_date      DATE NULL,
  end_date        DATE NULL,
  score           DECIMAL(5,2) NULL,
  certificate_url VARCHAR(500),
  notes           TEXT,
  approved_by     INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Evaluaciones 360 (appraisals) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appraisal_cycles (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  type            ENUM('annual','360','peer','self') DEFAULT 'annual',
  status          ENUM('draft','active','closed') DEFAULT 'draft',
  start_date      DATE NULL,
  end_date        DATE NULL,
  company_id      INT UNSIGNED NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appraisals (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_id        INT UNSIGNED NOT NULL,
  employee_id     INT UNSIGNED NOT NULL,
  reviewer_id     INT UNSIGNED NULL,
  type            ENUM('self','manager','peer','subordinate') DEFAULT 'manager',
  status          ENUM('pending','in_progress','submitted','calibrated') DEFAULT 'pending',
  overall_score   DECIMAL(5,2) NULL,
  strengths       TEXT,
  improvements    TEXT,
  goals_next      TEXT,
  submitted_at    DATETIME NULL,
  calibrated_at   DATETIME NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appraisal_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appraisal_id    INT UNSIGNED NOT NULL,
  criterion       VARCHAR(300) NOT NULL,
  weight          DECIMAL(5,2) DEFAULT 1.00,
  score           DECIMAL(5,2) NULL,
  comments        TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── RRHH base ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_centers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(200) NOT NULL,
  parent_id   INT UNSIGNED NULL,
  company_id  INT UNSIGNED NULL,
  status      ENUM('active','inactive') DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cost_center_code (code, company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  status      ENUM('active','inactive') DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed datos base para employee_types si tabla vacía
INSERT IGNORE INTO employee_types (code, name) VALUES
  ('permanent',   'Indefinido'),
  ('temporary',   'Contrato determinado'),
  ('part_time',   'Medio tiempo'),
  ('intern',      'Pasante'),
  ('contractor',  'Contratista / Servicios');

-- ─── Auditoría — columnas extra si faltan ─────────────────────────────────────

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_name  VARCHAR(200) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS actor_role  VARCHAR(100) NULL AFTER actor_name,
  ADD COLUMN IF NOT EXISTS entity      VARCHAR(100) NULL AFTER action,
  ADD COLUMN IF NOT EXISTS entity_id   VARCHAR(100) NULL AFTER entity,
  ADD COLUMN IF NOT EXISTS ip          VARCHAR(45)  NULL AFTER entity_id,
  ADD COLUMN IF NOT EXISTS user_agent  TEXT         NULL AFTER ip,
  ADD COLUMN IF NOT EXISTS details     JSON         NULL AFTER user_agent;

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_events(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at);
