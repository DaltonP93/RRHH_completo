-- 094_attendance_logs_source_enum.sql
-- Agrega 'manual_adjustment' al ENUM de attendance_logs.source.
-- Requerido por add_punch que inserta source='manual_adjustment'.
-- Idempotente — safe to re-run.

SET NAMES utf8mb4;
USE asistencia;

ALTER TABLE attendance_logs
  MODIFY COLUMN source ENUM('device','mobile','manual','manual_adjustment') DEFAULT 'device';
