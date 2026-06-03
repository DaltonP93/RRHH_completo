-- 093_daily_summary_approval.sql
-- Agrega columnas de aprobación para nómina en daily_summary.
-- calculation_status: provisional → adjusted → approved
-- approved_by: usuario que aprobó para nómina
-- approved_at: timestamp de aprobación
-- Safe to re-run.

SET NAMES utf8mb4;
USE asistencia;

DELIMITER $$

-- Helper idempotente para agregar columnas
DROP PROCEDURE IF EXISTS _m093_add_col$$
CREATE PROCEDURE _m093_add_col(
  IN tbl VARCHAR(64), IN col VARCHAR(64), IN col_def VARCHAR(255)
)
BEGIN
  SET @db = DATABASE();
  SELECT COUNT(*) INTO @exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = tbl AND COLUMN_NAME = col;
  IF @exists = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', col_def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- Agregar approved_by y approved_at a daily_summary
CALL _m093_add_col('daily_summary', 'approved_by',
  'INT NULL AFTER requires_review');
CALL _m093_add_col('daily_summary', 'approved_at',
  'DATETIME NULL AFTER approved_by');

-- FK si no existe (MySQL 8 compatible)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'daily_summary'
    AND COLUMN_NAME = 'approved_by'
    AND REFERENCED_TABLE_NAME = 'users'
);

SET @add_fk = IF(@fk_exists = 0,
  'ALTER TABLE daily_summary ADD CONSTRAINT fk_ds_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Cleanup
DROP PROCEDURE IF EXISTS _m093_add_col;
