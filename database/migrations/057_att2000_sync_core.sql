-- ============================================================
-- Migración 057 — att2000 sync core (idempotente)
-- Extiende infraestructura de migración 053 sin romper
-- entornos que ya la tienen aplicada.
-- ============================================================

-- ─── source_systems (si no existe de migración 053) ────────
CREATE TABLE IF NOT EXISTS source_systems (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  type        ENUM('sqlserver','oracle','api','csv','manual') NOT NULL,
  status      ENUM('active','inactive','archived') DEFAULT 'active',
  readonly    TINYINT(1)   DEFAULT 1,
  config_json JSON         NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── source_sync_runs: columnas adicionales ─────────────────
-- (la tabla base fue creada en 053; agregamos sólo lo que falta)
ALTER TABLE source_sync_runs
  ADD COLUMN IF NOT EXISTS total_updated INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by    INT NULL;

-- ─── source_employee_map: columnas adicionales ──────────────
ALTER TABLE source_employee_map
  ADD COLUMN IF NOT EXISTS source_badge_number VARCHAR(50)     NULL,
  ADD COLUMN IF NOT EXISTS match_confidence    DECIMAL(5,2)    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes               TEXT            NULL;

-- ─── attendance_import_staging: columnas adicionales ────────
ALTER TABLE attendance_import_staging
  ADD COLUMN IF NOT EXISTS source_record_id VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS badge_number      VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS work_code         VARCHAR(20)  NULL;

-- ─── unknown_attendance_events ──────────────────────────────
-- Almacena marcaciones de usuarios que aún no tienen mapeo.
CREATE TABLE IF NOT EXISTS unknown_attendance_events (
  id                 BIGINT   PRIMARY KEY AUTO_INCREMENT,
  source_system_id   INT      NOT NULL,
  source_user_id     VARCHAR(50)  NOT NULL,
  badge_number       VARCHAR(50)  NULL,
  raw_name           VARCHAR(200) NULL,
  check_time         DATETIME NOT NULL,
  check_type         VARCHAR(10)  NULL,
  normalized_type    ENUM('in','out','unknown') DEFAULT 'unknown',
  sensor_id          INT      NULL,
  raw_data           JSON     NULL,
  status             ENUM('pending','assigned','ignored') DEFAULT 'pending',
  assigned_to_employee INT    NULL,
  assigned_by        INT      NULL,
  assigned_at        DATETIME NULL,
  notes              TEXT     NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unknown_source (source_system_id, source_user_id),
  INDEX idx_unknown_status (status),
  FOREIGN KEY (source_system_id) REFERENCES source_systems(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── attendance_reconciliation_results: columnas adicionales ─
ALTER TABLE attendance_reconciliation_results
  ADD COLUMN IF NOT EXISTS resolved_by  INT      NULL,
  ADD COLUMN IF NOT EXISTS resolved_at  DATETIME NULL;

-- ─── Seed: fuente att2000 ────────────────────────────────────
INSERT IGNORE INTO source_systems (code, name, type, status, readonly)
VALUES ('att2000', 'ZKTeco att2000 (SQL Server)', 'sqlserver', 'active', 1);
