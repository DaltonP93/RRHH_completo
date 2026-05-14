-- ============================================================
-- Migración 058 — attendance source mode settings
-- Parámetros de configuración para el modo de fuente de
-- asistencia y la sincronización incremental con att2000.
-- ON DUPLICATE KEY UPDATE garantiza idempotencia.
-- ============================================================

INSERT INTO settings (`key`, `value`, description, data_type, is_public)
VALUES
  (
    'attendance.source_mode',
    'legacy_att2000',
    'Modo fuente asistencia: legacy_att2000|hybrid|direct_only',
    'string',
    0
  ),
  (
    'att2000.incremental_enabled',
    'false',
    'Sincronización incremental att2000 habilitada',
    'boolean',
    0
  ),
  (
    'att2000.incremental_cron',
    '*/5 * * * *',
    'Cron de sync incremental',
    'string',
    0
  ),
  (
    'att2000.safety_window_hours',
    '24',
    'Ventana de seguridad en horas para re-importar',
    'integer',
    0
  ),
  (
    'att2000.allow_write',
    'false',
    'Permitir escritura en att2000 (peligroso)',
    'boolean',
    0
  )
ON DUPLICATE KEY UPDATE description = VALUES(description);
