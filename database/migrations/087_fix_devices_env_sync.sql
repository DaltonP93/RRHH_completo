-- 087_fix_devices_env_sync.sql
-- Agrega columnas source y last_seen a la tabla devices para distinguir
-- el origen de cada reloj (env | att2000 | manual | bridge).
--
-- Seguro, idempotente, re-ejecutable en MySQL 8.
-- Aplicar: mysql asistencia < database/migrations/087_fix_devices_env_sync.sql

USE asistencia;

DELIMITER $$

DROP PROCEDURE IF EXISTS mig087_add_col $$
CREATE PROCEDURE mig087_add_col(
  IN p_table  VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_def    TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_def);
    PREPARE _s FROM @_sql;
    EXECUTE _s;
    DEALLOCATE PREPARE _s;
  END IF;
END $$

DELIMITER ;

CALL mig087_add_col('devices', 'source',
  "VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT 'env | att2000 | manual | bridge'");

CALL mig087_add_col('devices', 'last_seen', 'DATETIME NULL');

DROP PROCEDURE IF EXISTS mig087_add_col;
