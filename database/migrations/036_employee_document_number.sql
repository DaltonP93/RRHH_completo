-- Migración 036: Agregar document_number (cédula de identidad) a employees
-- También agrega gender para nómina SAA.
-- Operaciones idempotentes (no falla si ya existe).

DROP PROCEDURE IF EXISTS mig_036_add_col;
DELIMITER $
CREATE PROCEDURE mig_036_add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN defn TEXT)
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

-- Cédula de Identidad (obligatorio para exportar nómina SAA)
CALL mig_036_add_col('employees', 'document_number', 'VARCHAR(20) NULL AFTER employee_number');

-- Género (M/F/O) — opcional, usado en reportes estadísticos
CALL mig_036_add_col('employees', 'gender', "ENUM('M','F','O') NULL AFTER document_number");

DROP PROCEDURE mig_036_add_col;
