-- Migración 033: Índice FULLTEXT en audit_events + tabla system_settings
-- para almacenar configuración webhook / backup / etc.

-- FULLTEXT en auditoría (InnoDB ≥ 5.6)
ALTER TABLE audit_events
  ADD FULLTEXT KEY ft_audit_search (action, entity, details, username);

-- system_settings genérica (si no existe)
CREATE TABLE IF NOT EXISTS system_settings (
  key_name  VARCHAR(100) NOT NULL PRIMARY KEY,
  value     TEXT         NULL,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
