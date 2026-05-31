SET NAMES utf8mb4;
USE asistencia;

-- ─── 090_post_v2_audit_fixes.sql ─────────────────────────────────────────────
-- Fixes estructurales detectados en auditoría integral post-motor V2.
-- Idempotente — seguro de re-ejecutar.
-- Aplicar: mysql asistencia < database/migrations/090_post_v2_audit_fixes.sql

-- ─── 1. Índice faltante en daily_summary.employee_id ─────────────────────────
-- Cada reporte y cálculo de nómina hace WHERE employee_id = ? sobre esta tabla.
-- Sin índice es full-scan en tablas grandes.
CREATE INDEX IF NOT EXISTS idx_ds_employee ON daily_summary(employee_id);

-- ─── 2. Índice faltante en salary_history.employee_id ────────────────────────
CREATE INDEX IF NOT EXISTS idx_sh_employee ON salary_history(employee_id);

-- ─── 3. Columnas faltantes en salary_concepts ────────────────────────────────
-- payrollCore.js referencia estas columnas; sin ellas el POST/PUT de conceptos falla.
ALTER TABLE salary_concepts
  ADD COLUMN IF NOT EXISTS calculation_value  DECIMAL(18,2)  NULL          COMMENT 'Monto fijo alternativo a formula/percentage',
  ADD COLUMN IF NOT EXISTS affects_vacation_pay TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = incide en base de cálculo de vacaciones',
  ADD COLUMN IF NOT EXISTS is_taxable           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 = gravado por IPS/IRPC';

-- ─── 4. Índice en permissions.approved_by (y approvers nivel 1/2/final) ──────
-- FK sin índice produce full-scan en el workflow de aprobaciones.
CREATE INDEX IF NOT EXISTS idx_perm_approved_by ON permissions(approved_by);
CREATE INDEX IF NOT EXISTS idx_perm_l1          ON permissions(level1_approver_id);
CREATE INDEX IF NOT EXISTS idx_perm_l2          ON permissions(level2_approver_id);
CREATE INDEX IF NOT EXISTS idx_perm_final       ON permissions(final_approver_id);

-- ─── 5. Índice en employees.schedule_id ──────────────────────────────────────
-- JOIN frecuente en reportes de asistencia.
CREATE INDEX IF NOT EXISTS idx_emp_schedule ON employees(schedule_id);
