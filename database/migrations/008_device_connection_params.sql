-- -------------------------------------------------------------
-- 008_device_connection_params.sql
-- Parámetros de conexión específicos por reloj ZKTeco.
-- Compatible con MySQL 5.7+ (no usa ADD COLUMN IF NOT EXISTS).
-- -------------------------------------------------------------

-- Helper: añade columna solo si no existe
DROP PROCEDURE IF EXISTS add_col_if_missing;
DELIMITER $$
CREATE PROCEDURE add_col_if_missing(
  IN p_table  VARCHAR(64),
  IN p_col    VARCHAR(64),
  IN p_ddl    TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_col_if_missing('devices', 'connection_mode',
  "connection_mode ENUM('auto','tcp','udp') NOT NULL DEFAULT 'auto' COMMENT 'Protocolo: auto=TCP con fallback UDP, tcp=forzar, udp=forzar'");

CALL add_col_if_missing('devices', 'comm_password',
  "comm_password VARCHAR(30) NULL COMMENT 'Contraseña de comunicación del reloj (commkey)'");

CALL add_col_if_missing('devices', 'timeout_ms',
  "timeout_ms INT NOT NULL DEFAULT 10000 COMMENT 'Timeout en ms para conexión ZKTeco'");

DROP PROCEDURE add_col_if_missing;
