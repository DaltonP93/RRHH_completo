SET NAMES utf8mb4;
USE asistencia;

-- ─── 092_data_cleanup_employees.sql ──────────────────────────────────────────
-- Corrección de 4 problemas de calidad de datos en la tabla employees:
--   1. Empleados sin departamento  → asignar depto. "Sin asignar" (fallback)
--   2. Empleados sin nombre completo → poblar desde source_employee_map.raw_name
--   3. Mojibake en nombres          → vista diagnóstica para revisión manual por RRHH
--   4. device_id NULL en attendance_logs → enlazar cuando hay exactamente 1 dispositivo
-- Idempotente — seguro de re-ejecutar en MySQL 8.0+.
-- NOTA: att2000 (SQL Server) es SOLO LECTURA y no accesible desde este contexto;
--       las correcciones se realizan únicamente con datos ya disponibles en MySQL.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Helpers idempotentes ─────────────────────────────────────────────────────
DELIMITER $$

DROP PROCEDURE IF EXISTS _m092_add_col$$
CREATE PROCEDURE _m092_add_col(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_col
  ) THEN
    SET @_s = CONCAT('ALTER TABLE `', p_tbl, '` ADD COLUMN `', p_col, '` ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END$$

DELIMITER ;

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 1: Empleados sin departamento (≈1164 filas con department_id IS NULL)
-- Estrategia: crear departamento "Sin asignar" si no existe y asignarlo como
--             fallback. No se puede leer DEPTID de att2000 desde MySQL.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 Crear departamento "Sin asignar" si no existe
INSERT IGNORE INTO departments (name, code, active)
VALUES ('Sin asignar', 'SIN_ASIGNAR', 1);

-- 1.2 Asignar el departamento fallback a empleados sin departamento
UPDATE employees
SET    department_id = (
         SELECT id FROM departments WHERE code = 'SIN_ASIGNAR' LIMIT 1
       )
WHERE  department_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 2: Empleados sin nombre completo (≈687 filas)
-- Estrategia: leer raw_name desde source_employee_map para registros con
--             match_status = 'matched', dividir en primer_nombre / apellido
--             por el primer espacio.
-- ─────────────────────────────────────────────────────────────────────────────

DELIMITER $$

DROP PROCEDURE IF EXISTS _m092_fix_names$$
CREATE PROCEDURE _m092_fix_names()
BEGIN
  -- Cursor sobre empleados sin nombre completo que tienen un mapeo confirmado
  DECLARE v_emp_id    INT;
  DECLARE v_raw_name  VARCHAR(255);
  DECLARE v_first     VARCHAR(80);
  DECLARE v_last      VARCHAR(80);
  DECLARE v_space_pos INT;
  DECLARE v_done      TINYINT DEFAULT 0;

  DECLARE cur CURSOR FOR
    SELECT e.id,
           TRIM(sem.raw_name)
    FROM   employees e
    JOIN   source_employee_map sem ON sem.employee_id = e.id
    WHERE  sem.match_status = 'matched'
      AND  TRIM(COALESCE(sem.raw_name, '')) <> ''
      AND  (
             e.first_name IS NULL OR TRIM(e.first_name) = ''
             OR e.last_name IS NULL OR TRIM(e.last_name) = ''
           );

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_emp_id, v_raw_name;
    IF v_done THEN LEAVE read_loop; END IF;

    SET v_space_pos = LOCATE(' ', v_raw_name);

    IF v_space_pos > 0 THEN
      SET v_first = TRIM(SUBSTRING(v_raw_name, 1, v_space_pos - 1));
      SET v_last  = TRIM(SUBSTRING(v_raw_name, v_space_pos + 1));
    ELSE
      -- raw_name es una sola palabra: se pone en first_name, last_name queda '-'
      SET v_first = v_raw_name;
      SET v_last  = '-';
    END IF;

    -- Solo sobreescribir los campos que estén vacíos/NULL
    UPDATE employees
    SET
      first_name = CASE
                     WHEN first_name IS NULL OR TRIM(first_name) = ''
                     THEN v_first
                     ELSE first_name
                   END,
      last_name  = CASE
                     WHEN last_name IS NULL OR TRIM(last_name) = ''
                     THEN v_last
                     ELSE last_name
                   END
    WHERE id = v_emp_id;

  END LOOP;
  CLOSE cur;
END$$

DELIMITER ;

CALL _m092_fix_names();

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 3: Mojibake en nombres de empleados
-- Estrategia: NO aplicar conversión automática (riesgo de doble-conversión).
--             Se crea la vista v_employees_mojibake para que RRHH revise
--             manualmente los registros afectados y decida la corrección.
--
-- Diagnóstico (orientativo — ejecutar en sesión de consola para ver conteo):
--   SELECT COUNT(*) FROM employees
--   WHERE first_name REGEXP '[Ã]' OR last_name REGEXP '[Ã]';
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_employees_mojibake AS
SELECT
  e.id,
  e.code,
  e.first_name,
  e.last_name,
  CONCAT(e.first_name, ' ', e.last_name) AS full_name_raw,
  sem.raw_name                            AS att2000_raw_name,
  sem.match_status
FROM employees e
LEFT JOIN source_employee_map sem ON sem.employee_id = e.id
WHERE e.first_name REGEXP '[Ã¡Ã©Ã­ÃóÃºÃ±ÃÃ]'
   OR e.last_name  REGEXP '[Ã¡Ã©Ã­ÃóÃºÃ±ÃÃ]'
ORDER BY e.last_name, e.first_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 4: device_id NULL en attendance_logs donde source = 'device'
-- Estrategia: si existe exactamente 1 dispositivo en la tabla devices,
--             actualizar todos los logs afectados con ese device_id.
--             Si hay 0 o más de 1 dispositivo, no se modifica nada
--             (no es posible asignar con seguridad).
-- ─────────────────────────────────────────────────────────────────────────────

DELIMITER $$

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
    WHERE  source     = 'device'
      AND  device_id IS NULL;

    SELECT ROW_COUNT() AS logs_updated_with_device_id;
  ELSE
    -- No se puede asignar device_id con seguridad; registrar motivo
    SELECT CONCAT(
      'device_id no actualizado: se encontraron ',
      v_device_count,
      ' dispositivos. Se requiere asignación manual.'
    ) AS info_device_fix;
  END IF;
END$$

DELIMITER ;

CALL _m092_fix_device_ids();

-- ─── Limpieza de procedures auxiliares ───────────────────────────────────────
DROP PROCEDURE IF EXISTS _m092_add_col;
DROP PROCEDURE IF EXISTS _m092_fix_names;
DROP PROCEDURE IF EXISTS _m092_fix_device_ids;
