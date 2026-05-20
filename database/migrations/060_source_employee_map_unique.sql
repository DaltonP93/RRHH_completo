-- ─── Migración 060: índice único en source_employee_map ──────────────────────
-- Previene duplicados al re-ejecutar import-users.
-- La restricción UNIQUE asegura que un (source_system_id, source_user_id)
-- tenga solo una fila, permitiendo ON DUPLICATE KEY UPDATE en los imports.

ALTER TABLE source_employee_map
  ADD UNIQUE KEY uq_source_employee_map_system_user (source_system_id, source_user_id);

-- Índice secundario para búsquedas por badge_number
ALTER TABLE source_employee_map
  ADD INDEX idx_source_employee_map_badge (source_badge_number);

-- Índice para filtros por match_status
ALTER TABLE source_employee_map
  ADD INDEX idx_source_employee_map_status (match_status);
