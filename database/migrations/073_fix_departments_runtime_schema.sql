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

-- Fix runtime para /api/branches y /api/departments
CALL add_col_if_missing('departments', 'branch_id', 'INT NULL');
CALL add_col_if_missing('departments', 'coordinator_id', 'INT NULL');

CALL add_index_if_missing('departments', 'idx_departments_branch_id', '(branch_id)');
CALL add_index_if_missing('departments', 'idx_departments_coordinator_id', '(coordinator_id)');

DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
