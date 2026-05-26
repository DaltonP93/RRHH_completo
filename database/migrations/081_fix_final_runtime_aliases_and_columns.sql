-- 081_fix_final_runtime_aliases_and_columns.sql
-- Crea tablas de aguinaldo/anticipos que pueden faltar si la migración 043
-- no fue aplicada en el entorno staging, y garantiza columnas en employees.
-- Re-ejecutable sin errores en MySQL 8.

USE asistencia;

-- ─── Aguinaldo (christmas_bonus) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS christmas_bonus_runs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id  INT UNSIGNED NOT NULL DEFAULT 1,
  year        SMALLINT UNSIGNED NOT NULL,
  status      ENUM('draft','calculating','calculated','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
  generated_at  DATETIME NULL,
  approved_at   DATETIME NULL,
  payment_date  DATE NULL,
  total_amount  DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cbr_year_company (company_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS christmas_bonus_lines (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  christmas_bonus_run_id  BIGINT UNSIGNED NOT NULL,
  employee_id             INT UNSIGNED NOT NULL,
  months_worked           DECIMAL(4,2) NOT NULL DEFAULT 12,
  accrued_remuneration    DECIMAL(14,2) NOT NULL DEFAULT 0,
  calculated_amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
  advance_amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount             DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_date            DATE NULL,
  status                  ENUM('calculated','approved','paid') NOT NULL DEFAULT 'calculated',
  bank_id                 INT UNSIGNED NULL,
  created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cbl_run      (christmas_bonus_run_id),
  INDEX idx_cbl_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Columnas de empleados potencialmente faltantes ───────────────────────────

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

-- document_number: cédula de identidad del empleado
CALL add_col_if_missing('employees', 'document_number', 'VARCHAR(30) NULL');
-- employee_number: número interno (usado en COALESCE con document_number)
CALL add_col_if_missing('employees', 'employee_number', 'VARCHAR(30) NULL');
-- ips_number: número de afiliación IPS
CALL add_col_if_missing('employees', 'ips_number', 'VARCHAR(30) NULL');
-- company_id: si falta (algunos schemas más viejos)
CALL add_col_if_missing('employees', 'company_id', 'INT UNSIGNED NULL');

-- salary_advance_types: asegurar que la tabla tenga la estructura que usa el router
CREATE TABLE IF NOT EXISTS salary_advance_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  code        VARCHAR(50)  NULL,
  max_pct     DECIMAL(5,2) NULL,
  status      ENUM('active','deleted') NOT NULL DEFAULT 'active',
  company_id  INT UNSIGNED NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- compliance_calendar: tabla para vencimientos (usada por frontend de vencimientos)
CREATE TABLE IF NOT EXISTS compliance_calendar (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id      INT UNSIGNED NULL,
  title           VARCHAR(300) NOT NULL,
  description     TEXT NULL,
  due_date        DATE NOT NULL,
  category        VARCHAR(100) NULL,
  status          ENUM('pending','completed','overdue') NOT NULL DEFAULT 'pending',
  completed_at    DATETIME NULL,
  completed_by    INT UNSIGNED NULL,
  reminder_days   INT NOT NULL DEFAULT 5,
  notify_email    VARCHAR(300) NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cc_due_date (due_date),
  INDEX idx_cc_status   (status),
  INDEX idx_cc_company  (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_col_if_missing;
