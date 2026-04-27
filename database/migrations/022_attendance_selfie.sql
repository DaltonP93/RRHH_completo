-- Migración 022: agregar columna selfie_url a attendance_logs (idempotente)
-- Para verificación visual del marcaje vía selfie

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_logs' AND COLUMN_NAME = 'selfie_url'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE attendance_logs ADD COLUMN selfie_url VARCHAR(255) NULL AFTER source",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
