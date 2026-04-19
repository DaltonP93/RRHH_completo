-- Migration 005: idempotencia de attendance_logs
-- Evita duplicados cuando el reloj ZKTeco reintenta un PUSH.
--
-- Antes de aplicar: limpiar duplicados existentes (se queda el id más chico)
--
-- Uso:
--   mysql asistencia < database/migrations/005_attendance_logs_unique.sql

-- 1) Borrar duplicados antiguos conservando el registro más antiguo
DELETE a1 FROM attendance_logs a1
  INNER JOIN attendance_logs a2
    ON a1.employee_id = a2.employee_id
   AND a1.`timestamp` = a2.`timestamp`
   AND IFNULL(a1.device_id, 0) = IFNULL(a2.device_id, 0)
   AND a1.id > a2.id;

-- 2) Crear la clave única (device_id puede ser NULL → usar coalescencia virtual)
-- MySQL 8 soporta expresiones en índices únicos
ALTER TABLE attendance_logs
  ADD UNIQUE KEY uq_attendance_punch (employee_id, `timestamp`, (IFNULL(device_id, 0)));
