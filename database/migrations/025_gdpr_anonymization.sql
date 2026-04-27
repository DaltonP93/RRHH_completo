-- Migración 025: soporte para anonimización GDPR
-- Marca empleado como anonimizado y registra timestamp + actor

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'anonymized_at'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE employees
     ADD COLUMN anonymized_at DATETIME NULL,
     ADD COLUMN anonymized_by INT NULL",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Tabla de log de exportaciones GDPR
CREATE TABLE IF NOT EXISTS gdpr_exports (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  employee_id  INT NOT NULL,
  requested_by INT NOT NULL,
  export_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scope        VARCHAR(50) NOT NULL DEFAULT 'full',
  reason       VARCHAR(255) NULL,
  FOREIGN KEY (employee_id)  REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  INDEX idx_emp (employee_id, export_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
