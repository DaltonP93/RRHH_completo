-- Migración 014: Adjuntos en solicitudes de permiso
-- Permite subir justificativo (PDF / imagen) al crear una solicitud.

DROP PROCEDURE IF EXISTS mig_014_add_col;
DELIMITER $

CREATE PROCEDURE mig_014_add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN defn TEXT)
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

CALL mig_014_add_col('permissions', 'attachment_url',      'VARCHAR(500) NULL');
CALL mig_014_add_col('permissions', 'attachment_filename', 'VARCHAR(255) NULL');
CALL mig_014_add_col('permissions', 'attachment_size',     'INT NULL');
CALL mig_014_add_col('permissions', 'attachment_mime',     'VARCHAR(100) NULL');

DROP PROCEDURE mig_014_add_col;
