-- Migración 021: tabla de metas/objetivos de KPIs
-- Permite definir umbrales para presentismo, atrasos, ausentismo y horas extra

CREATE TABLE IF NOT EXISTS kpi_goals (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  metric          VARCHAR(50)  NOT NULL,                -- p.ej. 'attendance_rate', 'late_rate', 'absent_rate', 'overtime_avg'
  period_type     ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'monthly',
  scope           ENUM('global','department') NOT NULL DEFAULT 'global',
  department_id   INT NULL,
  target_value    DECIMAL(8,2) NOT NULL,                -- meta deseada
  threshold_warn  DECIMAL(8,2) NULL,                    -- amarillo
  threshold_crit  DECIMAL(8,2) NULL,                    -- rojo
  direction       ENUM('higher_is_better','lower_is_better') NOT NULL DEFAULT 'higher_is_better',
  unit            VARCHAR(10) NOT NULL DEFAULT '%',     -- '%' o 'min' o 'h'
  description     VARCHAR(200) NULL,
  active          TINYINT(1) NOT NULL DEFAULT 1,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_metric_scope (metric, period_type, scope, department_id),
  INDEX idx_metric (metric)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Metas iniciales sensatas (idempotente vía INSERT IGNORE)
INSERT IGNORE INTO kpi_goals (metric, period_type, scope, target_value, threshold_warn, threshold_crit, direction, unit, description) VALUES
  ('attendance_rate', 'monthly', 'global', 95.00, 90.00, 85.00, 'higher_is_better', '%',  'Tasa de presentismo mensual'),
  ('late_rate',       'monthly', 'global',  5.00, 10.00, 15.00, 'lower_is_better',  '%',  'Tasa de atrasos mensual'),
  ('absent_rate',     'monthly', 'global',  3.00,  5.00, 10.00, 'lower_is_better',  '%',  'Tasa de ausentismo mensual'),
  ('overtime_avg',    'monthly', 'global', 30.00, 60.00, 90.00, 'lower_is_better',  'min', 'Promedio mensual de horas extra por empleado');
