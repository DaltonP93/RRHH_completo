USE asistencia;

DELIMITER $$

DROP PROCEDURE IF EXISTS add_col_if_missing $$
CREATE PROCEDURE add_col_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS add_index_if_missing $$
CREATE PROCEDURE add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

-- 1) employees.branch_id para evitar 500 en employees/branches
CALL add_col_if_missing('employees', 'branch_id', 'INT NULL');
CALL add_index_if_missing('employees', 'idx_employees_branch_id', '(branch_id)');

-- 2) Tabla mínima payroll_runs para evitar caídas de rutas legacy/wildcard
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NULL,
  period VARCHAR(20) NULL,
  month INT NULL,
  year INT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  type VARCHAR(80) NULL,
  description VARCHAR(255) NULL,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_by INT NULL,
  approved_by INT NULL,
  approved_at DATETIME NULL,
  processed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payroll_runs_company (company_id),
  INDEX idx_payroll_runs_status (status),
  INDEX idx_payroll_runs_period (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Tipos de liquidación mínimos
CREATE TABLE IF NOT EXISTS settlement_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_settlement_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO settlement_types (code, name, description, active)
VALUES
  ('monthly', 'Liquidación mensual', 'Liquidación mensual de salario', 1),
  ('bonus', 'Aguinaldo', 'Liquidación de aguinaldo', 1),
  ('termination', 'Liquidación de salida', 'Liquidación por salida del personal', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  active = VALUES(active);

-- 4) Fuentes externas RRHH para /api/hr-sources
CREATE TABLE IF NOT EXISTS external_hr_sources (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  type VARCHAR(80) NULL,
  host VARCHAR(180) NULL,
  database_name VARCHAR(120) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'not_configured',
  last_sync_at DATETIME NULL,
  last_error TEXT NULL,
  config_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_external_hr_sources_code (code),
  INDEX idx_external_hr_sources_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO external_hr_sources (code, name, type, status)
VALUES
  ('att2000', 'ZKTeco Attendance Management', 'sqlserver', 'not_configured')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  type = VALUES(type);

-- 5) Notificaciones fallback, si el router las consulta
CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NULL,
  type VARCHAR(50) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id),
  INDEX idx_notifications_read (read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6) Aprobaciones fallback, si el router legacy las consulta
CREATE TABLE IF NOT EXISTS approvals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  entity_type VARCHAR(80) NULL,
  entity_id INT NULL,
  requested_by INT NULL,
  approved_by INT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  comments TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_approvals_status (status),
  INDEX idx_approvals_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
