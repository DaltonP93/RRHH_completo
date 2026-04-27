-- Migración 024: SLA en reglas de aprobación + tracking de SLA en permissions
-- (idempotente)

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permission_approval_rules' AND COLUMN_NAME = 'sla_hours'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE permission_approval_rules ADD COLUMN sla_hours INT NOT NULL DEFAULT 48 AFTER self_approve_max_days",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Timestamps de cada nivel para medir tiempos de aprobación
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permissions' AND COLUMN_NAME = 'level1_at'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE permissions
     ADD COLUMN level1_at DATETIME NULL,
     ADD COLUMN level2_at DATETIME NULL,
     ADD COLUMN sla_due_at DATETIME NULL",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
