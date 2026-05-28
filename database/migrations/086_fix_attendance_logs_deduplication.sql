-- 086_fix_attendance_logs_deduplication.sql
-- Corrige duplicados en attendance_logs y garantiza clave única idempotente.
--
-- Problema: migration 005 agregó UNIQUE KEY con expresión funcional
--   (IFNULL(device_id, 0)), que puede no haberse aplicado en staging si la
--   base se inicializó desde init.sql (que no la incluye).
--   Sin esa clave, INSERT IGNORE no deduplica → cada import agrega más filas.
--
-- Solución:
--   1. Limpiar duplicados existentes en (employee_id, timestamp), dejando el id menor.
--   2. Eliminar la clave funcional vieja si existe.
--   3. Crear clave única simple (employee_id, timestamp) si no existe.
--
-- Seguro, idempotente, re-ejecutable en MySQL 8.
-- Aplicar: mysql asistencia < database/migrations/086_fix_attendance_logs_deduplication.sql

USE asistencia;

-- ── 1. Borrar duplicados: para cada (employee_id, timestamp) conservar min(id) ──
DELETE al1
FROM attendance_logs al1
INNER JOIN attendance_logs al2
  ON  al1.employee_id = al2.employee_id
  AND al1.`timestamp` = al2.`timestamp`
  AND al1.id > al2.id;

-- ── 2. Eliminar clave funcional vieja (uq_attendance_punch) si existe ─────────
DELIMITER $$

DROP PROCEDURE IF EXISTS mig086_drop_index_if_exists $$
CREATE PROCEDURE mig086_drop_index_if_exists(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index
  ) THEN
    SET @_drop = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_index, '`');
    PREPARE _s FROM @_drop;
    EXECUTE _s;
    DEALLOCATE PREPARE _s;
  END IF;
END $$

-- ── 3. Agregar clave única simple (employee_id, timestamp) si no existe ────────
DROP PROCEDURE IF EXISTS mig086_add_unique_if_missing $$
CREATE PROCEDURE mig086_add_unique_if_missing(
  IN p_table  VARCHAR(64),
  IN p_index  VARCHAR(64),
  IN p_cols   TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index
  ) THEN
    SET @_add = CONCAT('ALTER TABLE `', p_table, '` ADD UNIQUE KEY `', p_index, '` ', p_cols);
    PREPARE _s FROM @_add;
    EXECUTE _s;
    DEALLOCATE PREPARE _s;
  END IF;
END $$

DELIMITER ;

CALL mig086_drop_index_if_exists('attendance_logs', 'uq_attendance_punch');
CALL mig086_add_unique_if_missing('attendance_logs', 'uq_attendance_dedup', '(employee_id, `timestamp`)');

DROP PROCEDURE IF EXISTS mig086_drop_index_if_exists;
DROP PROCEDURE IF EXISTS mig086_add_unique_if_missing;
