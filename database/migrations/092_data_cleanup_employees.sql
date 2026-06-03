SET NAMES utf8mb4;
USE asistencia;

-- ─── 092_data_cleanup_employees.sql ──────────────────────────────────────────
-- Corrección de 4 problemas de calidad de datos en la tabla employees:
--   1. Empleados sin departamento  → asignar depto. "Sin asignar" (fallback)
--   2. Empleados sin nombre completo → poblar desde source_employee_map.raw_name
--                                      (se omite si la tabla no existe)
--   3. Mojibake en nombres          → vista diagnóstica (sin JOIN si tabla ausente)
--   4. device_id NULL en attendance_logs → enlazar cuando hay exactamente 1 dispositivo
-- Idempotente — seguro de re-ejecutar en MySQL 8.0+.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 1: Empleados sin departamento
-- ─────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO departments (name, code, active)
VALUES ('Sin asignar', 'SIN_ASIGNAR', 1);

UPDATE employees
SET    department_id = (
         SELECT id FROM departments WHERE code = 'SIN_ASIGNAR' LIMIT 1
       )
WHERE  department_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 2: Empleados sin nombre completo
-- Si source_employee_map no existe se omite el bloque sin error.
-- Usa dynamic SQL para evitar referencias en tiempo de compilación a la tabla.
-- ─────────────────────────────────────────────────────────────────────────────

DELIMITER $$

DROP PROCEDURE IF EXISTS _m092_fix_names$$
CREATE PROCEDURE _m092_fix_names()
main_block: BEGIN
  DECLARE v_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO v_exists
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source_employee_map';

  IF v_exists = 0 THEN
    SELECT 'source_employee_map no existe — bloque nombres omitido' AS info_names;
    LEAVE main_block;
  END IF;

  -- UPDATE con JOIN usando dynamic SQL (evita cursor sobre tabla opcional)
  SET @_sql_names = "
    UPDATE employees e
    JOIN source_employee_map sem ON sem.employee_id = e.id
    SET
      e.first_name = CASE
        WHEN e.first_name IS NULL OR TRIM(e.first_name) = ''
        THEN TRIM(SUBSTRING_INDEX(TRIM(sem.raw_name), ' ', 1))
        ELSE e.first_name
      END,
      e.last_name = CASE
        WHEN e.last_name IS NULL OR TRIM(e.last_name) = ''
        THEN CASE
          WHEN LOCATE(' ', TRIM(sem.raw_name)) > 0
          THEN TRIM(SUBSTRING(TRIM(sem.raw_name), LOCATE(' ', TRIM(sem.raw_name)) + 1))
          ELSE '-'
        END
        ELSE e.last_name
      END
    WHERE sem.match_status = 'matched'
      AND TRIM(COALESCE(sem.raw_name, '')) <> ''
      AND (
        e.first_name IS NULL OR TRIM(e.first_name) = ''
        OR e.last_name IS NULL OR TRIM(e.last_name) = ''
      )
  ";
  PREPARE _st FROM @_sql_names;
  EXECUTE _st;
  DEALLOCATE PREPARE _st;
  SELECT ROW_COUNT() AS employees_names_updated;
END$$

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 3: Vista diagnóstica de mojibake
-- Con JOIN a source_employee_map si existe; sin JOIN si no existe.
-- ─────────────────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS _m092_create_mojibake_view$$
CREATE PROCEDURE _m092_create_mojibake_view()
BEGIN
  DECLARE v_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO v_exists
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source_employee_map';

  IF v_exists = 1 THEN
    SET @_sql_view =
      "CREATE OR REPLACE VIEW v_employees_mojibake AS
       SELECT
         e.id,
         e.code,
         e.first_name,
         e.last_name,
         CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,'')) AS full_name_raw,
         sem.raw_name     AS att2000_raw_name,
         sem.match_status
       FROM employees e
       LEFT JOIN source_employee_map sem ON sem.employee_id = e.id
       WHERE e.first_name REGEXP '[\\xC3]'
          OR e.last_name  REGEXP '[\\xC3]'
       ORDER BY e.last_name, e.first_name";
  ELSE
    SET @_sql_view =
      "CREATE OR REPLACE VIEW v_employees_mojibake AS
       SELECT
         e.id,
         e.code,
         e.first_name,
         e.last_name,
         CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,'')) AS full_name_raw,
         NULL AS att2000_raw_name,
         NULL AS match_status
       FROM employees e
       WHERE e.first_name REGEXP '[\\xC3]'
          OR e.last_name  REGEXP '[\\xC3]'
       ORDER BY e.last_name, e.first_name";
  END IF;

  PREPARE _st FROM @_sql_view;
  EXECUTE _st;
  DEALLOCATE PREPARE _st;
END$$

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 4: device_id NULL en attendance_logs
-- ─────────────────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS _m092_fix_device_ids$$
CREATE PROCEDURE _m092_fix_device_ids()
BEGIN
  DECLARE v_device_count INT;
  DECLARE v_device_id    INT;

  SELECT COUNT(*) INTO v_device_count FROM devices;

  IF v_device_count = 1 THEN
    SELECT id INTO v_device_id FROM devices LIMIT 1;
    UPDATE attendance_logs
    SET    device_id = v_device_id
    WHERE  source    = 'device'
      AND  device_id IS NULL;
    SELECT ROW_COUNT() AS logs_updated_with_device_id;
  ELSE
    SELECT CONCAT(
      'device_id no actualizado: ',
      v_device_count,
      ' dispositivos encontrados — asignación manual requerida.'
    ) AS info_device_fix;
  END IF;
END$$

DELIMITER ;

CALL _m092_fix_names();
CALL _m092_create_mojibake_view();
CALL _m092_fix_device_ids();

-- ─── Limpieza ─────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _m092_fix_names;
DROP PROCEDURE IF EXISTS _m092_create_mojibake_view;
DROP PROCEDURE IF EXISTS _m092_fix_device_ids;
