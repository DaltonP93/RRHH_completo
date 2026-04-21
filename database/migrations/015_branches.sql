-- Migración 015: Multi-sede (branches)
-- Agrega tabla branches y columnas branch_id en employees, devices y departments.
-- Todas las operaciones son idempotentes.

CREATE TABLE IF NOT EXISTS branches (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  code       VARCHAR(20) UNIQUE NOT NULL,
  name       VARCHAR(150) NOT NULL,
  address    VARCHAR(255),
  city       VARCHAR(100),
  phone      VARCHAR(30),
  timezone   VARCHAR(60) DEFAULT 'America/Asuncion',
  active     TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sede por defecto
INSERT IGNORE INTO branches (id, code, name, city)
VALUES (1, 'SAA-CENTRAL', 'Sede Central', 'Asunción');

-- Helper idempotente
DROP PROCEDURE IF EXISTS mig_015_add_col;
DELIMITER $
CREATE PROCEDURE mig_015_add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN defn TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @s = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN ', col, ' ', defn);
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$
DELIMITER ;

CALL mig_015_add_col('employees',   'branch_id', 'INT NULL DEFAULT 1');
CALL mig_015_add_col('devices',     'branch_id', 'INT NULL DEFAULT 1');
CALL mig_015_add_col('departments', 'branch_id', 'INT NULL DEFAULT 1');
CALL mig_015_add_col('users',       'branch_id', 'INT NULL');

DROP PROCEDURE mig_015_add_col;

-- Asignar todos los existentes a sede central por si quedaron NULL
UPDATE employees   SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE devices     SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE departments SET branch_id = 1 WHERE branch_id IS NULL;

-- Índices (crear solo si no existen)
DROP PROCEDURE IF EXISTS mig_015_add_idx;
DELIMITER $
CREATE PROCEDURE mig_015_add_idx(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @s = CONCAT('CREATE INDEX ', idx, ' ON ', tbl, ' (', cols, ')');
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$
DELIMITER ;

CALL mig_015_add_idx('employees',   'idx_branch', 'branch_id');
CALL mig_015_add_idx('devices',     'idx_branch', 'branch_id');
CALL mig_015_add_idx('departments', 'idx_branch', 'branch_id');
CALL mig_015_add_idx('users',       'idx_branch', 'branch_id');

DROP PROCEDURE mig_015_add_idx;
