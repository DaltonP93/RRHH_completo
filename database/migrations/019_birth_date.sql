-- Migración 019: agregar fecha de nacimiento a empleados (idempotente)
-- Para soportar calendario de cumpleaños y aniversarios laborales

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'birth_date'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE employees ADD COLUMN birth_date DATE NULL AFTER hire_date',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índice por mes de cumpleaños para consultas rápidas
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = 'idx_birth_month'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE employees ADD INDEX idx_birth_month ((MONTH(birth_date)))',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
