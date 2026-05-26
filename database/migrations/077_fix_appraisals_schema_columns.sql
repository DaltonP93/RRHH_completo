-- 077_fix_appraisals_schema_columns.sql
-- Corrige el desajuste entre los routers Express y las tablas creadas en 076.
-- Agrega columnas faltantes de forma idempotente con add_col_if_missing.
-- Re-ejecutable sin errores.

USE asistencia;

DELIMITER $$

DROP PROCEDURE IF EXISTS add_col_if_missing $$
CREATE PROCEDURE add_col_if_missing(
  IN p_table      VARCHAR(64),
  IN p_column     VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE _stmt FROM @_sql;
    EXECUTE _stmt;
    DEALLOCATE PREPARE _stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS add_index_if_missing $$
CREATE PROCEDURE add_index_if_missing(
  IN p_table      VARCHAR(64),
  IN p_index      VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` ', p_definition);
    PREPARE _stmt FROM @_sql;
    EXECUTE _stmt;
    DEALLOCATE PREPARE _stmt;
  END IF;
END $$

DELIMITER ;

-- ─── appraisals: columnas que el router consulta ──────────────────────────────
-- La migración 076 creó la tabla con overall_score/strengths/etc. pero el router
-- utiliza period_label, final_score, due_date, closed_at, template_id, created_by.

CALL add_col_if_missing('appraisals', 'period_label', "VARCHAR(50) NULL COMMENT 'ej. 2025-01'");
CALL add_col_if_missing('appraisals', 'final_score',  'DECIMAL(5,2) NULL');
CALL add_col_if_missing('appraisals', 'due_date',     'DATE NULL');
CALL add_col_if_missing('appraisals', 'closed_at',    'DATETIME NULL');
CALL add_col_if_missing('appraisals', 'template_id',  'INT UNSIGNED NULL');
CALL add_col_if_missing('appraisals', 'created_by',   'INT UNSIGNED NULL');

-- ─── appraisal_templates: columnas usadas por el router ──────────────────────
-- Router usa scale_min, scale_max, active (flag booleano), created_by.

CALL add_col_if_missing('appraisal_templates', 'scale_min',  'DECIMAL(5,2) NOT NULL DEFAULT 1.00');
CALL add_col_if_missing('appraisal_templates', 'scale_max',  'DECIMAL(5,2) NOT NULL DEFAULT 5.00');
CALL add_col_if_missing('appraisal_templates', 'active',     'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_col_if_missing('appraisal_templates', 'created_by', 'INT UNSIGNED NULL');

-- ─── appraisal_template_criteria: tabla auxiliar requerida por el router ─────

CREATE TABLE IF NOT EXISTS appraisal_template_criteria (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED NOT NULL,
  name        VARCHAR(300) NOT NULL,
  description TEXT,
  weight      DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── competency_levels: columnas que el router usa ────────────────────────────
-- Migración 076 creó columna `level` (TINYINT) pero el router usa `level_value`
-- y también filtra/inserta por `company_id` y `updated_at`.

CALL add_col_if_missing('competency_levels', 'level_value', 'TINYINT NULL');
CALL add_col_if_missing('competency_levels', 'company_id',  'INT UNSIGNED NULL');
CALL add_col_if_missing('competency_levels', 'updated_at',  'DATETIME NULL ON UPDATE CURRENT_TIMESTAMP');

-- ─── competencies: columnas usadas por el router ─────────────────────────────
-- Router filtra `deleted_at IS NULL`, inserta/actualiza `company_id` y `competency_type`.

CALL add_col_if_missing('competencies', 'deleted_at',      'DATETIME NULL');
CALL add_col_if_missing('competencies', 'company_id',      'INT UNSIGNED NULL');
CALL add_col_if_missing('competencies', 'competency_type', "VARCHAR(50) NOT NULL DEFAULT 'generic'");

-- ─── competency_categories: columna company_id usada en INSERT ───────────────

CALL add_col_if_missing('competency_categories', 'company_id', 'INT UNSIGNED NULL');

-- ─── performance_cycles: columnas que el router usa ──────────────────────────
-- Migración 076 creó `period_start`/`period_end` pero el router INSERT usa
-- `start_date`/`end_date`, y también usa `description`.

CALL add_col_if_missing('performance_cycles', 'start_date',  'DATE NULL');
CALL add_col_if_missing('performance_cycles', 'end_date',    'DATE NULL');
CALL add_col_if_missing('performance_cycles', 'description', 'TEXT NULL');

-- ─── document_templates: columnas del router ─────────────────────────────────
-- Migración 076 creó la tabla con schema básico (content, variables).
-- El router usa module, code, html_template, canvas_json, dynamic_fields_schema,
-- version, updated_by.

CALL add_col_if_missing('document_templates', 'module',                'VARCHAR(100) NULL');
CALL add_col_if_missing('document_templates', 'code',                  'VARCHAR(100) NULL');
CALL add_col_if_missing('document_templates', 'html_template',         'LONGTEXT NULL');
CALL add_col_if_missing('document_templates', 'canvas_json',           'JSON NULL');
CALL add_col_if_missing('document_templates', 'dynamic_fields_schema', 'JSON NULL');
CALL add_col_if_missing('document_templates', 'version',               'INT NOT NULL DEFAULT 1');
CALL add_col_if_missing('document_templates', 'updated_by',            'INT UNSIGNED NULL');
CALL add_col_if_missing('document_templates', 'company_id',            'INT UNSIGNED NULL');

-- ─── Índices de soporte ───────────────────────────────────────────────────────

CALL add_index_if_missing('appraisals',               'idx_appraisals_template',   '(template_id)');
CALL add_index_if_missing('appraisals',               'idx_appraisals_period',     '(period_label)');
CALL add_index_if_missing('appraisal_template_criteria', 'idx_atc_template',       '(template_id)');
CALL add_index_if_missing('competency_levels',        'idx_comp_lvl_value',        '(level_value)');
CALL add_index_if_missing('competencies',             'idx_comp_deleted_at',       '(deleted_at)');
CALL add_index_if_missing('document_templates',       'idx_doc_tmpl_module',       '(module)');
CALL add_index_if_missing('document_templates',       'idx_doc_tmpl_code',         '(code)');

-- ─── Limpieza ─────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
