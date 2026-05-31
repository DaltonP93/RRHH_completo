SET NAMES utf8mb4;
USE asistencia;

-- ─── 091_attendance_immutability.sql ─────────────────────────────────────────
-- Soporta el modelo de inmutabilidad de attendance_logs:
--   • attendance_logs es fuente cruda y nunca se elimina ni oculta.
--   • Cálculos automáticos quedan como 'provisional'.
--   • Correcciones humanas pasan por attendance_adjustments con flujo de aprobación.
-- Idempotente — seguro de re-ejecutar.

-- ─── 1. Estado del cálculo en daily_summary ───────────────────────────────────
ALTER TABLE daily_summary
  ADD COLUMN IF NOT EXISTS calculation_status ENUM('provisional','approved','adjusted')
    NOT NULL DEFAULT 'provisional'
    COMMENT 'provisional=automático, approved=aprobado por RRHH, adjusted=con correcciones aprobadas',
  ADD COLUMN IF NOT EXISTS requires_review TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = tiene anomalías que requieren revisión humana antes de impactar nómina';

-- ─── 2. Tabla de ajustes humanos ──────────────────────────────────────────────
-- Permite que supervisores/coordinadores/RRHH corrijan asistencia sin modificar
-- el registro crudo en attendance_logs.
CREATE TABLE IF NOT EXISTS attendance_adjustments (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  employee_id      INT          NOT NULL,
  work_date        DATE         NOT NULL,
  original_log_id  INT          NULL COMMENT 'ID de attendance_logs afectado, si aplica',
  adjustment_type  ENUM(
    'change_type',
    'add_punch',
    'exclude_from_calculation',
    'include_in_calculation',
    'change_time',
    'justify_missing_punch'
  ) NOT NULL,
  old_value        JSON         NULL COMMENT 'Snapshot del valor anterior',
  new_value        JSON         NULL COMMENT 'Valor corregido propuesto',
  reason           TEXT         NULL COMMENT 'Justificación del ajuste',
  requested_by     INT          NOT NULL COMMENT 'users.id del solicitante',
  approved_by      INT          NULL     COMMENT 'users.id del aprobador',
  status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  approved_at      DATETIME     NULL,
  FOREIGN KEY (employee_id)  REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id)     ON DELETE RESTRICT,
  FOREIGN KEY (approved_by)  REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Correcciones humanas de asistencia — trazabilidad completa sin tocar attendance_logs';

-- ─── 3. Índices para consultas de flujo de aprobación ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_adj_employee_date ON attendance_adjustments(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_adj_status        ON attendance_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_adj_requested_by  ON attendance_adjustments(requested_by);

-- ─── 4. Índice en attendance_anomalies.log_id para lookup rápido ─────────────
-- El campo raw_payload es JSON, se usa en consultas de tipo attendance_anomalies
-- donde anomaly_type = 'duplicate_nearby'. No indexable directamente, pero sí
-- podemos agregar índice en anomaly_type para filtros de UI.
CREATE INDEX IF NOT EXISTS idx_anom_type ON attendance_anomalies(anomaly_type);
