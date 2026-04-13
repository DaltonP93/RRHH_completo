-- ============================================================
-- Migración 002: Notificaciones, Reportes Programados y Justificaciones
-- Ejecutar después de init.sql
-- ============================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- Justificaciones en resumen diario
-- (columnas adicionales a daily_summary)
-- -------------------------------------------------------------
ALTER TABLE daily_summary
  ADD COLUMN justification      TEXT         NULL AFTER notes,
  ADD COLUMN justification_type VARCHAR(50)  NULL AFTER justification,
  ADD COLUMN justified_by       INT          NULL AFTER justification_type,
  ADD CONSTRAINT fk_ds_justified_by
    FOREIGN KEY (justified_by) REFERENCES users(id) ON DELETE SET NULL;

-- -------------------------------------------------------------
-- Configuración de notificaciones (clave → valor)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_settings (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  setting_key   VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Configuración por defecto (alertas activadas)
INSERT IGNORE INTO notification_settings (setting_key, setting_value) VALUES
  ('alert_late_enabled',   'true'),
  ('alert_absent_enabled', 'true'),
  ('alert_recipients',     '[]'),
  ('alert_late_threshold', '15');

-- -------------------------------------------------------------
-- Reportes automáticos programados
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_schedules (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  name            VARCHAR(150) NOT NULL,
  report_type     ENUM('marcadas','monthly','daily','weekly') DEFAULT 'marcadas',
  period_type     ENUM('daily','weekly','monthly') DEFAULT 'monthly',
  cron_expression VARCHAR(100) NOT NULL,      -- ej: "0 8 1 * *" = primer día del mes a las 8am
  timezone        VARCHAR(60)  DEFAULT 'America/Mexico_City',
  recipients      TEXT,                        -- emails separados por coma
  config          JSON,                        -- { employeeId, deptId, ... }
  active          TINYINT(1)   DEFAULT 1,
  last_run        DATETIME     NULL,
  created_by      INT          NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ejemplos de reportes programados
-- INSERT INTO report_schedules (name, report_type, period_type, cron_expression, recipients, active) VALUES
--   ('Reporte mensual RH',   'marcadas', 'monthly', '0 7 1 * *', 'rh@empresa.com', 0),
--   ('Reporte semanal lunes','marcadas', 'weekly',  '0 7 * * 1', 'rh@empresa.com', 0);
