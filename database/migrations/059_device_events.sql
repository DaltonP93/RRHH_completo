-- ============================================================
-- Migración 059 — device_events
-- Tabla de eventos raw enviados por relojes ZKTeco vía push
-- o por el bridge. Desacoplada del flujo de asistencia para
-- permitir reprocesamiento sin pérdida de datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS device_events (
  id              BIGINT   PRIMARY KEY AUTO_INCREMENT,
  device_id       INT      NULL,
  event_type      ENUM(
                    'punch','heartbeat','online','offline',
                    'tamper','door','alarm','firmware'
                  ) NOT NULL,
  employee_id     INT      NULL,
  badge_number    VARCHAR(50)  NULL,
  event_time      DATETIME NOT NULL,
  payload_json    JSON     NULL,
  status          ENUM('pending','processed','error','ignored') DEFAULT 'pending',
  error_message   TEXT     NULL,
  source          VARCHAR(50)  DEFAULT 'zkteco_push'
                  COMMENT 'zkteco_push|bridge_api|manual',
  processed_at    DATETIME NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_events_device  (device_id),
  INDEX idx_device_events_time    (event_time),
  INDEX idx_device_events_status  (status),
  INDEX idx_device_events_badge   (badge_number),
  FOREIGN KEY (device_id)    REFERENCES devices(id)    ON DELETE SET NULL,
  FOREIGN KEY (employee_id)  REFERENCES employees(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Ampliar tabla devices con estado de actividad ──────────
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS last_event_type    VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS last_punch_at      DATETIME    NULL,
  ADD COLUMN IF NOT EXISTS total_events_today INT         DEFAULT 0;
