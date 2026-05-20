-- ─── Migración 062: Login / Settings schema fix ──────────────────────────────
-- Agrega columnas de seguridad a users, crea tablas settings y company_settings,
-- e inserta valores por defecto.
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, INSERT IGNORE.
-- Sin transacciones: DDL de MySQL hace auto-commit.

-- ─── Columnas de seguridad en users ──────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password  TINYINT(1)   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login            TIMESTAMP    NULL,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMP    NULL,
  ADD COLUMN IF NOT EXISTS two_factor_enabled    TINYINT(1)   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS two_factor_secret     VARCHAR(100) NULL;

-- ─── settings (configuración global del sistema) ─────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  `key`        VARCHAR(120) NOT NULL,
  `value`      TEXT,
  description  TEXT NULL,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── company_settings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  `key`      VARCHAR(120) NOT NULL,
  `value`    TEXT,
  UNIQUE KEY uk_cs (company_id, `key`),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Valores por defecto en settings ─────────────────────────────────────────
INSERT IGNORE INTO settings (`key`, `value`, description) VALUES
  ('attendance.source_mode', 'legacy_att2000',    'Modo de fuente de asistencia: legacy_att2000 | native'),
  ('system.timezone',        'America/Asuncion',  'Zona horaria por defecto del sistema'),
  ('system.language',        'es',                'Idioma por defecto de la interfaz'),
  ('notifications.enabled',  'true',              'Habilitar o deshabilitar el módulo de notificaciones');
