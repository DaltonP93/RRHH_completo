SET NAMES utf8mb4;
USE asistencia;

-- ─── 091_attendance_immutability.sql ─────────────────────────────────────────
-- Soporta el modelo de inmutabilidad de attendance_logs:
--   * attendance_logs es fuente cruda y nunca se elimina ni oculta.
--   * Calculos automaticos quedan como 'provisional'.
--   * Correcciones humanas pasan por attendance_adjustments con flujo de aprobacion.
-- Idempotente — seguro de re-ejecutar en MySQL 8.0+.
-- NOTA: ADD COLUMN IF NOT EXISTS y CREATE INDEX IF NOT EXISTS son MariaDB-only.
--       Usamos stored procedures + information_schema para MySQL 8.0+.

-- ─── Helpers idempotentes ─────────────────────────────────────────────────────
DELIMITER $$

DROP PROCEDURE IF EXISTS _m091_add_col$$
CREATE PROCEDURE _m091_add_col(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_col
  ) THEN
    SET @_s = CONCAT('ALTER TABLE `', p_tbl, '` ADD COLUMN `', p_col, '` ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END$$

DROP PROCEDURE IF EXISTS _m091_add_idx$$
CREATE PROCEDURE _m091_add_idx(IN p_tbl VARCHAR(64), IN p_idx VARCHAR(64), IN p_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND INDEX_NAME = p_idx
  ) THEN
    SET @_s = CONCAT('CREATE INDEX `', p_idx, '` ON `', p_tbl, '` ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END$$

DELIMITER ;

-- ─── 1. Estado del calculo en daily_summary ──────────────────────────────────
-- ENUM con single-quotes: se pasa la definicion completa como argumento al helper.
-- Las comillas internas se escapan con '' (estandar SQL dentro de string con '...')
CALL _m091_add_col('daily_summary', 'calculation_status',
  'ENUM(''provisional'',''approved'',''adjusted'') NOT NULL DEFAULT ''provisional''');
CALL _m091_add_col('daily_summary', 'requires_review',
  'TINYINT(1) NOT NULL DEFAULT 0');

-- ─── 2. Tabla de ajustes humanos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_adjustments (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  employee_id      INT          NOT NULL,
  work_date        DATE         NOT NULL,
  original_log_id  INT          NULL,
  adjustment_type  ENUM(
    'change_type',
    'add_punch',
    'exclude_from_calculation',
    'include_in_calculation',
    'change_time',
    'justify_missing_punch'
  ) NOT NULL,
  old_value        JSON         NULL,
  new_value        JSON         NULL,
  reason           TEXT         NULL,
  requested_by     INT          NOT NULL,
  approved_by      INT          NULL,
  status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  approved_at      DATETIME     NULL,
  FOREIGN KEY (employee_id)  REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id)     ON DELETE RESTRICT,
  FOREIGN KEY (approved_by)  REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 3. Indices para flujo de aprobacion ─────────────────────────────────────
CALL _m091_add_idx('attendance_adjustments', 'idx_adj_employee_date', '(employee_id, work_date)');
CALL _m091_add_idx('attendance_adjustments', 'idx_adj_status',        '(status)');
CALL _m091_add_idx('attendance_adjustments', 'idx_adj_requested_by',  '(requested_by)');
CALL _m091_add_idx('attendance_anomalies',   'idx_anom_type',          '(anomaly_type)');

-- ─── Limpieza ─────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _m091_add_col;
DROP PROCEDURE IF EXISTS _m091_add_idx;
