-- -------------------------------------------------------------
-- 009_device_sensor_id.sql
-- Agrega sensor_id (= MachineNo/SENSORID en att2000) a devices
-- para mapear correctamente marcajes CHECKINOUT.SENSORID → device.
-- -------------------------------------------------------------

DROP PROCEDURE IF EXISTS add_col_if_missing_009;
DELIMITER $$
CREATE PROCEDURE add_col_if_missing_009(
  IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_col_if_missing_009('devices', 'sensor_id',
  "sensor_id INT NULL COMMENT 'MachineNo/SENSORID del reloj en att2000.CHECKINOUT. Usado para mapear marcajes históricos.'");

DROP PROCEDURE add_col_if_missing_009;

-- Índice para búsqueda rápida por sensor_id
DROP PROCEDURE IF EXISTS add_idx_if_missing_009;
DELIMITER $$
CREATE PROCEDURE add_idx_if_missing_009(
  IN p_table VARCHAR(64), IN p_idx VARCHAR(64), IN p_cols VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_idx
  ) THEN
    SET @sql = CONCAT('CREATE INDEX `', p_idx, '` ON `', p_table, '` (', p_cols, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;
CALL add_idx_if_missing_009('devices', 'idx_devices_sensor_id', 'sensor_id');
DROP PROCEDURE add_idx_if_missing_009;

-- Valores conocidos según configuración de producción (CLAUDE.md):
-- Comedor=101, Lavadero=103, Gerencia=1
UPDATE devices SET sensor_id = 101 WHERE name = 'Reloj Comedor'  AND sensor_id IS NULL;
UPDATE devices SET sensor_id = 103 WHERE name = 'Reloj Lavadero' AND sensor_id IS NULL;
UPDATE devices SET sensor_id = 1   WHERE name = 'Reloj Gerencia' AND sensor_id IS NULL;
