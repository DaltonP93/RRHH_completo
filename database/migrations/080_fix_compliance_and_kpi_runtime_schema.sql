-- 080_fix_compliance_and_kpi_runtime_schema.sql
-- Crea tablas de cumplimiento MTESS/IPS, KPI goals y otras de forma idempotente.
-- Re-ejecutable sin errores en MySQL 8.

USE asistencia;

-- ─── MTESS comunicaciones ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mtess_communications (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id          INT UNSIGNED NULL,
  company_id           INT UNSIGNED NULL,
  payroll_run_id       INT UNSIGNED NULL,
  communication_type   VARCHAR(50) NOT NULL COMMENT 'ALTA,BAJA,VACACIONES,PERMISO,etc.',
  status               ENUM('pending','generated','submitted','accepted','rejected') NOT NULL DEFAULT 'pending',
  effective_date       DATE NULL,
  submission_date      DATE NULL,
  acceptance_date      DATE NULL,
  rejection_reason     TEXT NULL,
  reference_number     VARCHAR(100) NULL,
  file_url             VARCHAR(500) NULL,
  notes                TEXT NULL,
  created_by           INT UNSIGNED NULL,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mc_employee  (employee_id),
  INDEX idx_mc_company   (company_id),
  INDEX idx_mc_payroll   (payroll_run_id),
  INDEX idx_mc_type      (communication_type),
  INDEX idx_mc_status    (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── IPS / REI ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ips_rei_records (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id      INT UNSIGNED NULL,
  payroll_run_id  INT UNSIGNED NULL,
  employee_id     INT UNSIGNED NULL,
  period_year     SMALLINT UNSIGNED NOT NULL,
  period_month    TINYINT UNSIGNED NOT NULL,
  salary_base     DECIMAL(14,2) NOT NULL DEFAULT 0,
  ips_employee    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ips_employer    DECIMAL(14,2) NOT NULL DEFAULT 0,
  days_worked     DECIMAL(6,2)  NOT NULL DEFAULT 0,
  status          ENUM('draft','submitted','accepted','rejected') NOT NULL DEFAULT 'draft',
  submitted_at    DATETIME NULL,
  accepted_at     DATETIME NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ips_company  (company_id),
  INDEX idx_ips_period   (period_year, period_month),
  INDEX idx_ips_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Planillas laborales ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labor_planillas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id      INT UNSIGNED NULL,
  name            VARCHAR(300) NOT NULL,
  period_year     SMALLINT UNSIGNED NOT NULL,
  period_month    TINYINT UNSIGNED NOT NULL,
  type            VARCHAR(100) NULL COMMENT 'mensual, anual, mtess, ips',
  status          ENUM('draft','submitted','accepted') NOT NULL DEFAULT 'draft',
  file_url        VARCHAR(500) NULL,
  submitted_at    DATETIME NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lp_company (company_id),
  INDEX idx_lp_period  (period_year, period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Tasas de seguridad social ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_security_rates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  code            VARCHAR(50)  NULL,
  employee_rate   DECIMAL(6,4) NOT NULL DEFAULT 0,
  employer_rate   DECIMAL(6,4) NOT NULL DEFAULT 0,
  effective_from  DATE NOT NULL,
  effective_to    DATE NULL,
  status          ENUM('active','deleted') NOT NULL DEFAULT 'active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Calendario de vencimientos ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_calendar (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id      INT UNSIGNED NULL,
  title           VARCHAR(300) NOT NULL,
  description     TEXT NULL,
  due_date        DATE NOT NULL,
  category        VARCHAR(100) NULL COMMENT 'ips, mtess, impuestos, interno',
  status          ENUM('pending','completed','overdue') NOT NULL DEFAULT 'pending',
  completed_at    DATETIME NULL,
  completed_by    INT UNSIGNED NULL,
  reminder_days   INT NOT NULL DEFAULT 5,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cc_due_date (due_date),
  INDEX idx_cc_status   (status),
  INDEX idx_cc_company  (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── KPI Goals ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kpi_goals (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  metric          VARCHAR(100) NOT NULL,
  period_type     ENUM('monthly','quarterly','annual') NOT NULL DEFAULT 'monthly',
  scope           ENUM('global','department') NOT NULL DEFAULT 'global',
  department_id   INT UNSIGNED NULL,
  target_value    DECIMAL(10,4) NOT NULL,
  threshold_warn  DECIMAL(10,4) NULL,
  threshold_crit  DECIMAL(10,4) NULL,
  direction       ENUM('higher_is_better','lower_is_better') NOT NULL DEFAULT 'higher_is_better',
  unit            VARCHAR(20) NOT NULL DEFAULT '%',
  description     TEXT NULL,
  active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_kpi_metric_scope_dept (metric, scope, department_id),
  INDEX idx_kpi_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Perfiles de nómina (alias para payroll_profiles si aún no existe) ───────
-- payroll_profiles ya se crea en migración 079; este bloque es no-op si ya existe.

CREATE TABLE IF NOT EXISTS payroll_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  code        VARCHAR(50)  NULL,
  frequency   ENUM('monthly','biweekly','weekly','eventual') NOT NULL DEFAULT 'monthly',
  description TEXT NULL,
  status      ENUM('active','deleted') NOT NULL DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Idempotent column additions ─────────────────────────────────────────────

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
DELIMITER ;

-- payroll_runs: columna payroll_run_id_mtess por si el router la necesita
CALL add_col_if_missing('mtess_communications', 'is_bulk',        'TINYINT(1) NOT NULL DEFAULT 0');

-- compliance_calendar: columna notify_email
CALL add_col_if_missing('compliance_calendar', 'notify_email',    'VARCHAR(300) NULL');

DROP PROCEDURE IF EXISTS add_col_if_missing;
