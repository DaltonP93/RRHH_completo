-- Migration 072: Fix staging schema runtime errors
-- Safe to run multiple times (idempotent)

USE asistencia;

-- 1. Add branch_id to employees if missing
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS branch_id INT NULL AFTER department_id;

ALTER TABLE employees
  ADD INDEX IF NOT EXISTS idx_emp_branch (branch_id);

-- 2. Create payroll_runs if not exists (minimal columns needed by payrollRuns.js)
CREATE TABLE IF NOT EXISTS payroll_runs (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED     NOT NULL,
  year       SMALLINT         NOT NULL,
  month      TINYINT          NOT NULL,
  status     ENUM('draft','calculated','approved','closed') NOT NULL DEFAULT 'draft',
  name       VARCHAR(255)     NULL,
  created_by INT              NULL,
  created_at DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pr_company (company_id),
  INDEX idx_pr_year_month (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create settlement_types if not exists (used by payrollRuns.js)
CREATE TABLE IF NOT EXISTS settlement_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create external_hr_sources if not exists (used by hrSources.js)
CREATE TABLE IF NOT EXISTS external_hr_sources (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  type         VARCHAR(50)  NOT NULL DEFAULT 'rest',
  url          TEXT         NULL,
  method       VARCHAR(10)  NOT NULL DEFAULT 'GET',
  auth_type    VARCHAR(50)  NULL,
  schedule_cron VARCHAR(100) NULL,
  enabled      TINYINT(1)   NOT NULL DEFAULT 0,
  last_run_at  DATETIME     NULL,
  last_status  VARCHAR(50)  NULL,
  last_result  TEXT         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. payroll_run_items for settlements (used in payrollRuns.js joins)
CREATE TABLE IF NOT EXISTS payroll_run_items (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_run_id INT UNSIGNED NOT NULL,
  employee_id    INT UNSIGNED NOT NULL,
  employee_name  VARCHAR(255) NULL,
  base_salary    DECIMAL(15,2) NOT NULL DEFAULT 0,
  net_salary     DECIMAL(15,2) NOT NULL DEFAULT 0,
  status         VARCHAR(50)   NOT NULL DEFAULT 'pending',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pri_run (payroll_run_id),
  INDEX idx_pri_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
