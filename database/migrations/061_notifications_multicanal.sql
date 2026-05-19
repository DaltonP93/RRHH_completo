-- ─── Migración 061: Notificaciones Multicanal ────────────────────────────────
-- Crea las tablas del sistema de notificaciones multicanal.
-- Idempotente: usa CREATE TABLE IF NOT EXISTS y ADD COLUMN IF NOT EXISTS.
-- Sin transacciones: DDL de MySQL hace auto-commit.

-- ─── notification_channels ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_channels (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  company_id   INT NULL,
  channel_type ENUM('email','whatsapp','telegram','sms','push','internal') NOT NULL,
  name         VARCHAR(150) NOT NULL,
  config_json  TEXT,
  enabled      TINYINT(1) DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── notification_event_catalog ──────────────────────────────────────────────
-- La migración 051 puede haberla creado con una estructura ligeramente diferente.
-- IF NOT EXISTS es seguro; si ya existe, se omite la creación sin error.
CREATE TABLE IF NOT EXISTS notification_event_catalog (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  code             VARCHAR(120) NOT NULL UNIQUE,
  name             VARCHAR(150) NOT NULL,
  description      TEXT NULL,
  default_channels JSON NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── notification_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_events (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_catalog_id    INT NOT NULL,
  entity_type         VARCHAR(80) NOT NULL,
  entity_id           BIGINT NULL,
  triggered_by        INT NULL,
  payload_json        TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ne_catalog (event_catalog_id),
  INDEX idx_ne_entity  (entity_type, entity_id),
  INDEX idx_ne_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── notification_queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_queue (
  id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
  notification_event_id   BIGINT NULL,
  channel_type            VARCHAR(50) NOT NULL,
  recipient               VARCHAR(255) NOT NULL,
  subject                 VARCHAR(255) NULL,
  body                    TEXT,
  status                  ENUM('pending','processing','sent','failed','cancelled') DEFAULT 'pending',
  attempts                INT DEFAULT 0,
  last_attempt_at         TIMESTAMP NULL,
  sent_at                 TIMESTAMP NULL,
  error_message           TEXT,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_nq_status  (status),
  INDEX idx_nq_event   (notification_event_id),
  INDEX idx_nq_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── notification_delivery_logs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  queue_id          BIGINT NULL,
  channel_type      VARCHAR(50) NOT NULL,
  recipient         VARCHAR(255) NOT NULL,
  status            VARCHAR(50) NOT NULL,
  provider_response TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ndl_queue   (queue_id),
  INDEX idx_ndl_status  (status),
  INDEX idx_ndl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── notification_preferences ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id           INT AUTO_INCREMENT,
  user_id      INT NOT NULL,
  event_code   VARCHAR(120) NOT NULL,
  channel_type VARCHAR(50) NOT NULL,
  enabled      TINYINT(1) DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_np (user_id, event_code, channel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── notification_templates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(120) NOT NULL UNIQUE,
  event_code    VARCHAR(120) NOT NULL,
  channel_type  VARCHAR(50) NOT NULL,
  subject       VARCHAR(255) NULL,
  body_template TEXT,
  language      VARCHAR(10) DEFAULT 'es',
  is_active     TINYINT(1) DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_nt_event_code (event_code),
  INDEX idx_nt_channel    (channel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── internal_notifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_notifications (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(255),
  body       TEXT,
  link       VARCHAR(500) NULL,
  is_read    TINYINT(1) DEFAULT 0,
  read_at    TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_in_user    (user_id),
  INDEX idx_in_is_read (is_read),
  INDEX idx_in_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── notification_settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_settings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NULL,
  `key`      VARCHAR(120) NOT NULL,
  `value`    TEXT,
  UNIQUE KEY uk_ns (company_id, `key`),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── system_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  `key`       VARCHAR(120) NOT NULL UNIQUE,
  `value`     TEXT,
  description TEXT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── user_notifications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT NOT NULL,
  internal_notification_id BIGINT NULL,
  is_read                  TINYINT(1) DEFAULT 0,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_un_user    (user_id),
  INDEX idx_un_is_read (is_read),
  INDEX idx_un_int_not (internal_notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
