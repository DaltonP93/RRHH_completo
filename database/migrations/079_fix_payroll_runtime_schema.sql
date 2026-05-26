-- 079_fix_payroll_runtime_schema.sql
-- Crea tablas de nómina/payroll de forma idempotente.
-- Re-ejecutable sin errores en MySQL 8.

USE asistencia;

-- ─── Catálogos ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settlement_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  code        VARCHAR(50)  NOT NULL,
  description TEXT NULL,
  status      ENUM('active','deleted') NOT NULL DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_settlement_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_advance_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  code        VARCHAR(50)  NULL,
  max_pct     DECIMAL(5,2) NULL COMMENT 'porcentaje máximo del salario',
  status      ENUM('active','deleted') NOT NULL DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_monthly_parameters (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  year                SMALLINT UNSIGNED NOT NULL,
  month               TINYINT UNSIGNED NOT NULL,
  minimum_wage        DECIMAL(14,2) NOT NULL DEFAULT 0,
  ips_employee_rate   DECIMAL(6,4)  NOT NULL DEFAULT 0.0900,
  ips_employer_rate   DECIMAL(6,4)  NOT NULL DEFAULT 0.1650,
  aguinaldo_rate      DECIMAL(6,4)  NOT NULL DEFAULT 0.0833,
  company_id          INT UNSIGNED NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pmp_year_month (year, month, company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_concept_groups (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  code        VARCHAR(50)  NULL,
  type        ENUM('earning','deduction','info') NOT NULL DEFAULT 'earning',
  description TEXT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  status      ENUM('active','deleted') NOT NULL DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_concepts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id        INT UNSIGNED NULL,
  name            VARCHAR(200) NOT NULL,
  code            VARCHAR(50)  NULL,
  type            ENUM('earning','deduction','info') NOT NULL DEFAULT 'earning',
  affects_ips     TINYINT(1) NOT NULL DEFAULT 0,
  affects_income  TINYINT(1) NOT NULL DEFAULT 0,
  fixed_amount    DECIMAL(14,2) NULL,
  formula         TEXT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  status          ENUM('active','deleted') NOT NULL DEFAULT 'active',
  company_id      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sc_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Runs de nómina ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_runs (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(300) NOT NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  type           ENUM('monthly','special','exit','vacation','bonus') NOT NULL DEFAULT 'monthly',
  status         ENUM('draft','processing','calculated','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
  company_id     INT UNSIGNED NULL,
  department_id  INT UNSIGNED NULL,
  total_gross    DECIMAL(14,2) NULL DEFAULT 0,
  total_net      DECIMAL(14,2) NULL DEFAULT 0,
  total_ips_emp  DECIMAL(14,2) NULL DEFAULT 0,
  total_ips_pat  DECIMAL(14,2) NULL DEFAULT 0,
  closed_at      DATETIME NULL,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pr_company    (company_id),
  INDEX idx_pr_status     (status),
  INDEX idx_pr_period     (period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Liquidaciones por empleado ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_settlements (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_run_id  INT UNSIGNED NOT NULL,
  employee_id     INT UNSIGNED NOT NULL,
  gross_income    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ips_employee    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ips_employer    DECIMAL(14,2) NOT NULL DEFAULT 0,
  other_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_pay         DECIMAL(14,2) NOT NULL DEFAULT 0,
  days_worked     DECIMAL(6,2)  NOT NULL DEFAULT 0,
  status          ENUM('draft','calculated','approved','paid') NOT NULL DEFAULT 'draft',
  notes           TEXT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_es_run      (payroll_run_id),
  INDEX idx_es_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settlement_lines (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  settlement_id   INT UNSIGNED NOT NULL,
  concept_id      INT UNSIGNED NULL,
  concept_code    VARCHAR(50)  NULL,
  concept_name    VARCHAR(200) NOT NULL,
  type            ENUM('earning','deduction','info') NOT NULL DEFAULT 'earning',
  amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
  quantity        DECIMAL(10,4) NULL DEFAULT 1,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sl_settlement (settlement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Alias: payroll_items ≡ settlement_lines (algunos routers usan este nombre)
CREATE TABLE IF NOT EXISTS payroll_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_run_id  INT UNSIGNED NOT NULL,
  employee_id     INT UNSIGNED NOT NULL,
  concept_id      INT UNSIGNED NULL,
  concept_code    VARCHAR(50)  NULL,
  concept_name    VARCHAR(200) NOT NULL,
  type            ENUM('earning','deduction','info') NOT NULL DEFAULT 'earning',
  amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
  quantity        DECIMAL(10,4) NULL DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pi_run      (payroll_run_id),
  INDEX idx_pi_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Perfiles salariales ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_profiles (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT UNSIGNED NOT NULL,
  base_salary     DECIMAL(14,2) NOT NULL DEFAULT 0,
  salary_type     ENUM('monthly','daily','hourly') NOT NULL DEFAULT 'monthly',
  payroll_type_id INT UNSIGNED NULL,
  cost_center_id  INT UNSIGNED NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  effective_from  DATE NOT NULL,
  effective_to    DATE NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pp_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_history (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT UNSIGNED NOT NULL,
  base_salary     DECIMAL(14,2) NOT NULL DEFAULT 0,
  previous_salary DECIMAL(14,2) NULL,
  change_type     VARCHAR(100)  NULL COMMENT 'aumento, corrección, ingreso, etc.',
  reason          TEXT NULL,
  effective_date  DATE NOT NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sh_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_fixed_concepts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT UNSIGNED NOT NULL,
  concept_id      INT UNSIGNED NULL,
  concept_code    VARCHAR(50)  NULL,
  concept_name    VARCHAR(200) NOT NULL,
  amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
  type            ENUM('earning','deduction') NOT NULL DEFAULT 'earning',
  active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_efc_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Anticipos salariales ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salary_advances (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT UNSIGNED NOT NULL,
  advance_type_id INT UNSIGNED NULL,
  amount          DECIMAL(14,2) NOT NULL,
  period_year     SMALLINT UNSIGNED NULL,
  period_month    TINYINT UNSIGNED NULL,
  status          ENUM('pending','approved','paid','cancelled') NOT NULL DEFAULT 'pending',
  notes           TEXT NULL,
  approved_by     INT UNSIGNED NULL,
  approved_at     DATETIME NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sa_employee (employee_id),
  INDEX idx_sa_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Días de asistencia usados en cálculo de nómina ─────────────────────────

CREATE TABLE IF NOT EXISTS attendance_days (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id   INT UNSIGNED NOT NULL,
  payroll_run_id INT UNSIGNED NULL,
  date          DATE NOT NULL,
  worked        TINYINT(1) NOT NULL DEFAULT 0,
  hours_worked  DECIMAL(5,2) NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ad_emp_date (employee_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
