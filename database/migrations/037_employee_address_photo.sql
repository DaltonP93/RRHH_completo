-- Migración 037: Agregar address y photo_url a employees
-- También agrega photo_url al perfil del usuario (users).
-- Operaciones idempotentes.

DROP PROCEDURE IF EXISTS mig_037_add_col;
DELIMITER $
CREATE PROCEDURE mig_037_add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN defn TEXT)
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

-- Domicilio del empleado (editable desde Mi Perfil)
CALL mig_037_add_col('employees', 'address', 'VARCHAR(255) NULL AFTER phone');

-- Foto de perfil del empleado (URL relativa a /uploads/)
CALL mig_037_add_col('employees', 'photo_url', 'VARCHAR(500) NULL AFTER address');

-- Foto de perfil en la tabla users (para usuarios sin empleado vinculado)
CALL mig_037_add_col('users', 'photo_url', 'VARCHAR(500) NULL AFTER full_name');

DROP PROCEDURE mig_037_add_col;
