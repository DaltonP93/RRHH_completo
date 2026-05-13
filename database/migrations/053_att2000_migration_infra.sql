-- 053_att2000_migration_infra.sql

-- ─── 1. source_systems ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_systems (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  type        ENUM('sqlserver','oracle','api','csv','manual') NOT NULL,
  status      ENUM('active','inactive','archived') DEFAULT 'active',
  config_json JSON NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO source_systems (code, name, type, status) VALUES
  ('att2000', 'ZKTeco att2000 (SQL Server)', 'sqlserver', 'active');

-- ─── 2. source_sync_runs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_sync_runs (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  source_system_id INT NOT NULL,
  sync_type        ENUM('full','incremental','reconciliation','diagnostic') NOT NULL,
  entity_type      ENUM('users','departments','devices','punches','schedules','all') NOT NULL,
  status           ENUM('pending','running','completed','failed','cancelled') DEFAULT 'pending',
  started_at       DATETIME NULL,
  finished_at      DATETIME NULL,
  from_datetime    DATETIME NULL,
  to_datetime      DATETIME NULL,
  total_read       BIGINT DEFAULT 0,
  total_inserted   BIGINT DEFAULT 0,
  total_updated    BIGINT DEFAULT 0,
  total_skipped    BIGINT DEFAULT 0,
  total_errors     BIGINT DEFAULT 0,
  error_message    TEXT NULL,
  created_by       INT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_source_status (source_system_id, status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (source_system_id) REFERENCES source_systems(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 3. source_employee_map ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_employee_map (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  source_system_id INT NOT NULL,
  source_user_id   VARCHAR(100) NOT NULL,
  source_badge_number VARCHAR(100) NULL,
  employee_id      INT NULL,
  raw_name         VARCHAR(255) NULL,
  match_status     ENUM('matched','unmatched','duplicate','manual_review','ignored') DEFAULT 'unmatched',
  match_confidence DECIMAL(5,2) DEFAULT 0,
  notes            TEXT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_user (source_system_id, source_user_id),
  INDEX idx_employee_id (employee_id),
  INDEX idx_match_status (match_status),
  FOREIGN KEY (source_system_id) REFERENCES source_systems(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 4. attendance_import_staging ────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_import_staging (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  sync_run_id      BIGINT NOT NULL,
  source_system_id INT NOT NULL,
  source_record_id VARCHAR(100) NULL,
  source_user_id   VARCHAR(100) NOT NULL,
  badge_number     VARCHAR(100) NULL,
  check_time       DATETIME NOT NULL,
  check_type       VARCHAR(20) NULL,
  sensor_id        VARCHAR(100) NULL,
  verify_code      VARCHAR(50) NULL,
  work_code        VARCHAR(50) NULL,
  raw_data         JSON NULL,
  normalized_type  ENUM('in','out','break_start','break_end','unknown') DEFAULT 'unknown',
  employee_id      INT NULL,
  import_status    ENUM('pending','imported','duplicate','error','ignored') DEFAULT 'pending',
  error_message    TEXT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_att_source (source_system_id, source_user_id, check_time, check_type),
  INDEX idx_check_time (check_time),
  INDEX idx_import_status (import_status),
  INDEX idx_employee_time (employee_id, check_time),
  FOREIGN KEY (sync_run_id) REFERENCES source_sync_runs(id),
  FOREIGN KEY (source_system_id) REFERENCES source_systems(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 5. attendance_reconciliation_results ────────────────────────
CREATE TABLE IF NOT EXISTS attendance_reconciliation_results (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  sync_run_id   BIGINT NOT NULL,
  employee_id   INT NULL,
  date          DATE NOT NULL,
  issue_type    ENUM('missing_local','missing_source','time_mismatch','duplicate','unknown_user','invalid_sequence') NOT NULL,
  source_count  INT DEFAULT 0,
  local_count   INT DEFAULT 0,
  details_json  JSON NULL,
  status        ENUM('open','resolved','ignored') DEFAULT 'open',
  resolved_by   INT NULL,
  resolved_at   DATETIME NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date (date),
  INDEX idx_status (status),
  INDEX idx_employee_date (employee_id, date),
  FOREIGN KEY (sync_run_id) REFERENCES source_sync_runs(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 6. device_events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_events (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id    INT NULL,
  event_type   ENUM('punch','heartbeat','device_online','device_offline','sync_started','sync_finished','error') NOT NULL,
  employee_id  INT NULL,
  badge_number VARCHAR(100) NULL,
  event_time   DATETIME NOT NULL,
  payload_json JSON NULL,
  status       ENUM('received','processed','failed','ignored') DEFAULT 'received',
  error_message TEXT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_time (device_id, event_time),
  INDEX idx_status (status),
  INDEX idx_event_type (event_type),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 7. Ampliar tabla devices ─────────────────────────────────────
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS serial_number    VARCHAR(100) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS device_model     VARCHAR(100) NULL AFTER serial_number,
  ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(100) NULL AFTER device_model,
  ADD COLUMN IF NOT EXISTS mode             ENUM('push','polling','hybrid') DEFAULT 'push' AFTER firmware_version,
  ADD COLUMN IF NOT EXISTS last_heartbeat   DATETIME NULL,
  ADD COLUMN IF NOT EXISTS last_event_at    DATETIME NULL,
  ADD COLUMN IF NOT EXISTS last_error       TEXT NULL,
  ADD COLUMN IF NOT EXISTS active           TINYINT(1) DEFAULT 1;

-- ─── 8. Ampliar tabla employees ───────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS full_name_raw   VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS source_system   VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS source_user_id  VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS imported_at     DATETIME NULL,
  ADD COLUMN IF NOT EXISTS import_status   ENUM('manual','imported_pending_review','validated','ignored') DEFAULT 'manual';

-- ─── 9. Ampliar tabla departments ─────────────────────────────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS external_source VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS external_id     VARCHAR(100) NULL;

ALTER TABLE departments
  ADD UNIQUE KEY IF NOT EXISTS uk_department_source (external_source, external_id);

-- ─── 10. attendance.source_mode setting ───────────────────────────
INSERT INTO settings (`key`, `value`, description, data_type, is_public) VALUES
  ('attendance.source_mode', 'legacy_att2000',
   'Modo de fuente de asistencia: legacy_att2000 | hybrid | direct_only',
   'string', 0),
  ('att2000.incremental_enabled', 'false',
   'Activar sincronización incremental automática desde att2000',
   'boolean', 0),
  ('att2000.incremental_cron', '*/5 * * * *',
   'Cron de sincronización incremental att2000',
   'string', 0),
  ('att2000.safety_window_hours', '24',
   'Ventana de seguridad en horas para sync incremental',
   'string', 0)
ON DUPLICATE KEY UPDATE value = VALUES(value);
