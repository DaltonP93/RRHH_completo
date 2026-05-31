-- 089_attendance_work_policies.sql
-- Políticas configurables de jornada laboral (descuento almuerzo, jornada corrida, etc.)
--
-- Idempotente, seguro de re-ejecutar en MySQL 8.
-- Aplicar: mysql asistencia < database/migrations/089_attendance_work_policies.sql

SET NAMES utf8mb4;
USE asistencia;

-- ─── attendance_work_policies ─────────────────────────────────────────────────
-- Resolución de política: employee > department > branch > company > global
CREATE TABLE IF NOT EXISTS attendance_work_policies (
  id                       INT           NOT NULL AUTO_INCREMENT,
  name                     VARCHAR(100)  NOT NULL,
  scope_type               ENUM('global','company','branch','department','employee')
                                         NOT NULL DEFAULT 'global',
  scope_id                 INT           NULL COMMENT 'dept_id, branch_id, employee_id según scope_type',
  auto_deduct_break        TINYINT(1)    NOT NULL DEFAULT 0
                             COMMENT 'Si 1: descontar break_minutes cuando solo hay 2 marcaciones',
  break_minutes            INT           NOT NULL DEFAULT 0
                             COMMENT 'Minutos de almuerzo a descontar automáticamente',
  apply_break_after_minutes INT          NOT NULL DEFAULT 0
                             COMMENT 'Solo descontar si worked_gross >= este valor (0=siempre)',
  require_lunch_punch      TINYINT(1)    NOT NULL DEFAULT 0
                             COMMENT 'Si 1: emitir anomalía cuando no hay marcación de almuerzo',
  allow_continuous_shift   TINYINT(1)    NOT NULL DEFAULT 1
                             COMMENT 'Si 1: permitir jornada corrida (2 marcaciones) sin anomalía',
  max_daily_minutes        INT           NOT NULL DEFAULT 720,
  min_daily_minutes        INT           NOT NULL DEFAULT 0,
  active                   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_scope (scope_type, scope_id),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Política global por defecto (id=1, nunca descontar almuerzo automáticamente)
INSERT IGNORE INTO attendance_work_policies
  (id, name, scope_type, auto_deduct_break, break_minutes, apply_break_after_minutes,
   require_lunch_punch, allow_continuous_shift, max_daily_minutes, min_daily_minutes, active)
VALUES
  (1, 'Política global por defecto', 'global', 0, 0, 0, 0, 1, 720, 0, 1);

-- ─── daily_summary: columnas de política y minutos brutos ─────────────────────
DELIMITER $$

DROP PROCEDURE IF EXISTS mig089_add_col $$
CREATE PROCEDURE mig089_add_col(
  IN p_table  VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_after  VARCHAR(64),
  IN p_def    TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    IF p_after IS NOT NULL THEN
      SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_def,
        ' AFTER `', p_after, '`');
    ELSE
      SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_def);
    END IF;
    PREPARE _s FROM @_sql;
    EXECUTE _s;
    DEALLOCATE PREPARE _s;
  END IF;
END $$

DELIMITER ;

-- daily_summary: gross_minutes (span total), policy_id y policy_source
CALL mig089_add_col('daily_summary', 'gross_minutes',  'break_minutes',   'INT NOT NULL DEFAULT 0');
CALL mig089_add_col('daily_summary', 'policy_id',      'anomaly_count',   'INT NULL');
CALL mig089_add_col('daily_summary', 'policy_source',  'policy_id',       "VARCHAR(30) NULL COMMENT 'global|department|employee…'");

-- attendance_segments: segment_type y columnas de minutos separadas
CALL mig089_add_col('attendance_segments', 'segment_type',
  'anomaly_code',
  "ENUM('work','break','incomplete','manual') NOT NULL DEFAULT 'work'");
CALL mig089_add_col('attendance_segments', 'gross_minutes',  'minutes',      'INT NULL');
CALL mig089_add_col('attendance_segments', 'break_minutes',  'gross_minutes','INT NOT NULL DEFAULT 0');
CALL mig089_add_col('attendance_segments', 'worked_minutes', 'break_minutes','INT NULL');

DROP PROCEDURE IF EXISTS mig089_add_col;
