SET NAMES utf8mb4;
USE asistencia;

-- ─── 090_post_v2_audit_fixes.sql ─────────────────────────────────────────────
-- Fixes estructurales detectados en auditoría integral post-motor V2.
-- Idempotente — seguro de re-ejecutar en MySQL 8.0+.
-- Aplicar: mysql -uroot -p<pass> asistencia < database/migrations/090_post_v2_audit_fixes.sql

-- ─── Helpers idempotentes ─────────────────────────────────────────────────────
DELIMITER $$

DROP PROCEDURE IF EXISTS _m090_add_col$$
CREATE PROCEDURE _m090_add_col(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_col
  ) THEN
    SET @_s = CONCAT('ALTER TABLE `', p_tbl, '` ADD COLUMN `', p_col, '` ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END$$

-- _m090_add_idx: crea un índice solo si no existe.
-- NO verifica existencia de columnas — usar _m090_add_idx_on_col si la columna
-- podría no existir en la tabla (ej: columnas agregadas por otras migraciones).
DROP PROCEDURE IF EXISTS _m090_add_idx$$
CREATE PROCEDURE _m090_add_idx(IN p_tbl VARCHAR(64), IN p_idx VARCHAR(64), IN p_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND INDEX_NAME = p_idx
  ) THEN
    SET @_s = CONCAT('CREATE INDEX `', p_idx, '` ON `', p_tbl, '` ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END$$

-- _m090_add_idx_on_col: igual que _m090_add_idx pero además verifica que la
-- columna p_key_col exista antes de intentar crear el índice.
-- Usar cuando la columna puede no estar en la tabla (schema variable por entorno).
DROP PROCEDURE IF EXISTS _m090_add_idx_on_col$$
CREATE PROCEDURE _m090_add_idx_on_col(
  IN p_tbl     VARCHAR(64),
  IN p_idx     VARCHAR(64),
  IN p_key_col VARCHAR(64),
  IN p_def     TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_key_col
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND INDEX_NAME = p_idx
  ) THEN
    SET @_s = CONCAT('CREATE INDEX `', p_idx, '` ON `', p_tbl, '` ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END$$

DELIMITER ;

-- ─── 1. Índice faltante en daily_summary.employee_id ─────────────────────────
CALL _m090_add_idx('daily_summary', 'idx_ds_employee', '(employee_id)');

-- ─── 2. Índice faltante en salary_history.employee_id ────────────────────────
CALL _m090_add_idx('salary_history', 'idx_sh_employee', '(employee_id)');

-- ─── 3. Columnas faltantes en salary_concepts ────────────────────────────────
CALL _m090_add_col('salary_concepts', 'calculation_value',    'DECIMAL(18,2) NULL');
CALL _m090_add_col('salary_concepts', 'affects_vacation_pay', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL _m090_add_col('salary_concepts', 'is_taxable',           'TINYINT(1) NOT NULL DEFAULT 1');

-- ─── 4. Índices en permissions (approvers) ───────────────────────────────────
-- Usamos _m090_add_idx_on_col porque level1/2/final_approver_id pueden no existir
-- si el workflow multi-nivel aún no fue migrado en este entorno.
CALL _m090_add_idx_on_col('permissions', 'idx_perm_approved_by', 'approved_by',       '(approved_by)');
CALL _m090_add_idx_on_col('permissions', 'idx_perm_l1',          'level1_approver_id','(level1_approver_id)');
CALL _m090_add_idx_on_col('permissions', 'idx_perm_l2',          'level2_approver_id','(level2_approver_id)');
CALL _m090_add_idx_on_col('permissions', 'idx_perm_final',       'final_approver_id', '(final_approver_id)');

-- ─── 5. Índice en employees.schedule_id ──────────────────────────────────────
CALL _m090_add_idx('employees', 'idx_emp_schedule', '(schedule_id)');

-- ─── Limpieza ─────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _m090_add_col;
DROP PROCEDURE IF EXISTS _m090_add_idx;
DROP PROCEDURE IF EXISTS _m090_add_idx_on_col;
