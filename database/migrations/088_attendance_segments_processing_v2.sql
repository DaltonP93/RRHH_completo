-- 088_attendance_segments_processing_v2.sql
-- Motor de asistencia V2: soporte multi-marcación con almuerzo.
-- Agrega lunch_out / lunch_in / anomaly_count a daily_summary.
-- Crea attendance_segments y attendance_anomalies.
--
-- Idempotente, seguro de re-ejecutar en MySQL 8.
-- Aplicar: mysql asistencia < database/migrations/088_attendance_segments_processing_v2.sql

USE asistencia;

DELIMITER $$

DROP PROCEDURE IF EXISTS mig088_add_col $$
CREATE PROCEDURE mig088_add_col(
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

-- ─── daily_summary: columnas nuevas ───────────────────────────────────────────
CALL mig088_add_col('daily_summary', 'lunch_out',     'first_in',          'DATETIME NULL');
CALL mig088_add_col('daily_summary', 'lunch_in',      'lunch_out',         'DATETIME NULL');
CALL mig088_add_col('daily_summary', 'anomaly_count', 'overtime_minutes',  'INT NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS mig088_add_col;

-- ─── attendance_segments ──────────────────────────────────────────────────────
-- Cada fila representa un bloque trabajo (in_at → out_at) dentro de una jornada.
-- Una jornada con almuerzo tiene 2 segmentos: mañana y tarde.
CREATE TABLE IF NOT EXISTS attendance_segments (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  employee_id     INT           NOT NULL,
  work_date       DATE          NOT NULL,
  segment_index   TINYINT       NOT NULL DEFAULT 0  COMMENT '0=primero, 1=segundo…',
  in_log_id       BIGINT        NULL     COMMENT 'FK lógica a attendance_logs.id',
  out_log_id      BIGINT        NULL,
  in_at           DATETIME      NULL,
  out_at          DATETIME      NULL,
  minutes         INT           NULL     COMMENT 'NULL si segmento incompleto',
  source          VARCHAR(30)   NOT NULL DEFAULT 'calculated',
  confidence      ENUM('explicit','inferred','estimated') NOT NULL DEFAULT 'inferred',
  anomaly_code    VARCHAR(40)   NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seg (employee_id, work_date, segment_index),
  CONSTRAINT fk_seg_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_seg_date     (work_date),
  INDEX idx_seg_emp_date (employee_id, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── attendance_anomalies ─────────────────────────────────────────────────────
-- Anomalías detectadas durante el procesamiento V2 de una jornada.
-- Tipos posibles:
--   missing_in | missing_out | duplicate_punch | out_before_in
--   only_in | only_out | long_shift | no_lunch_break
--   unmapped_employee | no_department | no_name
CREATE TABLE IF NOT EXISTS attendance_anomalies (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  employee_id     INT           NOT NULL,
  work_date       DATE          NOT NULL,
  anomaly_type    VARCHAR(40)   NOT NULL,
  severity        ENUM('info','warning','error') NOT NULL DEFAULT 'warning',
  message         VARCHAR(500)  NULL,
  raw_payload     JSON          NULL,
  resolved        TINYINT(1)    NOT NULL DEFAULT 0,
  resolved_by     INT           NULL,
  resolved_at     DATETIME      NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_ano_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_ano_emp_date (employee_id, work_date),
  INDEX idx_ano_date     (work_date),
  INDEX idx_ano_type     (anomaly_type),
  INDEX idx_ano_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
