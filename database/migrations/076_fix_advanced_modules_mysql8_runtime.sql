-- 076_fix_advanced_modules_mysql8_runtime.sql
-- Corrige la migración 075 para MySQL 8 staging:
-- - Usa procedimientos idempotentes add_col_if_missing / add_index_if_missing
--   en lugar de ADD COLUMN IF NOT EXISTS (no soportado en MySQL 8 de staging).
-- - Agrega tabla appraisal_templates faltante.
-- - Re-ejecutable sin errores (DROP PROCEDURE IF EXISTS + CREATE TABLE IF NOT EXISTS).

USE asistencia;

DELIMITER $$

DROP PROCEDURE IF EXISTS add_col_if_missing $$
CREATE PROCEDURE add_col_if_missing(
  IN p_table      VARCHAR(64),
  IN p_column     VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE _stmt FROM @_sql;
    EXECUTE _stmt;
    DEALLOCATE PREPARE _stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS add_index_if_missing $$
CREATE PROCEDURE add_index_if_missing(
  IN p_table      VARCHAR(64),
  IN p_index      VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` ', p_definition);
    PREPARE _stmt FROM @_sql;
    EXECUTE _stmt;
    DEALLOCATE PREPARE _stmt;
  END IF;
END $$

DELIMITER ;

-- ─── Auditoría — columnas extra (versión compatible MySQL 8) ──────────────────
-- Reemplaza el ADD COLUMN IF NOT EXISTS de la migración 075 que falla en staging.

CALL add_col_if_missing('audit_events', 'actor_name', 'VARCHAR(200) NULL');
CALL add_col_if_missing('audit_events', 'actor_role', 'VARCHAR(100) NULL');
CALL add_col_if_missing('audit_events', 'entity',     'VARCHAR(100) NULL');
CALL add_col_if_missing('audit_events', 'entity_id',  'VARCHAR(100) NULL');
CALL add_col_if_missing('audit_events', 'ip',         'VARCHAR(45)  NULL');
CALL add_col_if_missing('audit_events', 'user_agent', 'TEXT NULL');
CALL add_col_if_missing('audit_events', 'details',    'JSON NULL');

-- Índices en audit_events
CALL add_index_if_missing('audit_events', 'idx_audit_action',     '(action)');
CALL add_index_if_missing('audit_events', 'idx_audit_entity',     '(entity, entity_id)');
CALL add_index_if_missing('audit_events', 'idx_audit_created_at', '(created_at)');

-- ─── Documentos ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_folders (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  parent_id  INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_templates (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  content     LONGTEXT,
  variables   JSON,
  category_id INT UNSIGNED NULL,
  folder_id   INT UNSIGNED NULL,
  status      ENUM('active','inactive','deleted') DEFAULT 'active',
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  category_id INT UNSIGNED NULL,
  type        ENUM('technical','behavioral','leadership','generic') DEFAULT 'generic',
  status      ENUM('active','inactive','deleted') DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_levels (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  competency_id INT UNSIGNED NOT NULL,
  level         TINYINT NOT NULL COMMENT '1-5',
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS position_competencies (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  position_id    INT UNSIGNED NOT NULL,
  competency_id  INT UNSIGNED NOT NULL,
  required_level TINYINT DEFAULT 3,
  weight         DECIMAL(5,2) DEFAULT 1.00,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pos_comp (position_id, competency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Ciclos de desempeño y evaluaciones ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS performance_cycles (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  status       ENUM('draft','active','closed') DEFAULT 'draft',
  type         ENUM('annual','semester','quarterly','custom') DEFAULT 'annual',
  company_id   INT UNSIGNED NULL,
  created_by   INT UNSIGNED NULL,
  started_at   DATETIME NULL,
  closed_at    DATETIME NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_evaluations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_id      INT UNSIGNED NOT NULL,
  employee_id   INT UNSIGNED NOT NULL,
  evaluator_id  INT UNSIGNED NULL,
  type          ENUM('self','manager','peer','360') DEFAULT 'manager',
  status        ENUM('pending','in_progress','submitted','approved') DEFAULT 'pending',
  overall_score DECIMAL(5,2) NULL,
  comments      TEXT,
  submitted_at  DATETIME NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competency_evaluation_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluation_id INT UNSIGNED NOT NULL,
  competency_id INT UNSIGNED NOT NULL,
  score         TINYINT NULL COMMENT '1-5',
  comments      TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Planes de desarrollo ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS development_plans (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  cycle_id    INT UNSIGNED NULL,
  title       VARCHAR(200) NOT NULL,
  objectives  TEXT,
  status      ENUM('draft','active','completed','cancelled') DEFAULT 'draft',
  due_date    DATE NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS development_plan_actions (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id      INT UNSIGNED NOT NULL,
  description  VARCHAR(500) NOT NULL,
  type         ENUM('training','mentoring','project','reading','other') DEFAULT 'other',
  status       ENUM('pending','in_progress','completed') DEFAULT 'pending',
  due_date     DATE NULL,
  completed_at DATETIME NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Catálogo de formación ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_catalog (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  description    TEXT,
  provider       VARCHAR(150),
  duration_hours DECIMAL(6,2) DEFAULT 0,
  modality       ENUM('online','presential','blended','self_paced') DEFAULT 'presential',
  cost           DECIMAL(12,2) DEFAULT 0,
  currency       CHAR(3) DEFAULT 'PYG',
  status         ENUM('active','inactive','deleted') DEFAULT 'active',
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  type       ENUM('annual','360','peer','self') DEFAULT 'annual',
  status     ENUM('draft','active','closed') DEFAULT 'draft',
  start_date DATE NULL,
  end_date   DATE NULL,
  company_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appraisals (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_id      INT UNSIGNED NOT NULL,
  employee_id   INT UNSIGNED NOT NULL,
  reviewer_id   INT UNSIGNED NULL,
  type          ENUM('self','manager','peer','subordinate') DEFAULT 'manager',
  status        ENUM('pending','in_progress','submitted','calibrated') DEFAULT 'pending',
  overall_score DECIMAL(5,2) NULL,
  strengths     TEXT,
  improvements  TEXT,
  goals_next    TEXT,
  submitted_at  DATETIME NULL,
  calibrated_at DATETIME NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appraisal_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appraisal_id INT UNSIGNED NOT NULL,
  criterion    VARCHAR(300) NOT NULL,
  weight       DECIMAL(5,2) DEFAULT 1.00,
  score        DECIMAL(5,2) NULL,
  comments     TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── appraisal_templates (nueva, faltaba en 075) ─────────────────────────────

CREATE TABLE IF NOT EXISTS appraisal_templates (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  type        ENUM('annual','360','peer','self','custom') DEFAULT 'annual',
  items       JSON COMMENT 'Array de criterios predefinidos con peso',
  status      ENUM('active','inactive','deleted') DEFAULT 'active',
  company_id  INT UNSIGNED NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── RRHH base ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_centers (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(50) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  parent_id  INT UNSIGNED NULL,
  company_id INT UNSIGNED NULL,
  status     ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

INSERT IGNORE INTO employee_types (code, name) VALUES
  ('permanent',  'Indefinido'),
  ('temporary',  'Contrato determinado'),
  ('part_time',  'Medio tiempo'),
  ('intern',     'Pasante'),
  ('contractor', 'Contratista / Servicios');

-- ─── Índices de rendimiento para módulos avanzados ────────────────────────────

CALL add_index_if_missing('competency_levels',     'idx_comp_levels_comp_id', '(competency_id)');
CALL add_index_if_missing('competency_evaluations','idx_comp_eval_cycle',     '(cycle_id)');
CALL add_index_if_missing('competency_evaluations','idx_comp_eval_employee',  '(employee_id)');
CALL add_index_if_missing('development_plans',     'idx_dev_plans_employee',  '(employee_id)');
CALL add_index_if_missing('employee_trainings',    'idx_emp_train_employee',  '(employee_id)');
CALL add_index_if_missing('appraisals',            'idx_appraisals_cycle',    '(cycle_id)');
CALL add_index_if_missing('appraisals',            'idx_appraisals_employee', '(employee_id)');
CALL add_index_if_missing('document_templates',    'idx_doc_tmpl_status',     '(status)');

-- ─── Limpieza ─────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
