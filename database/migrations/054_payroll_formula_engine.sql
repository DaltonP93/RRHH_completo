-- 054_payroll_formula_engine.sql
-- Motor de fórmulas de nómina + tasas IPS con vigencias

-- ─── 1. Ampliar salary_concepts con fórmula y tipo de cálculo ───
ALTER TABLE salary_concepts
  ADD COLUMN IF NOT EXISTS calculation_type
    ENUM('fixed','percentage_base','percentage_concept','formula','manual')
    DEFAULT 'fixed' AFTER concept_type,
  ADD COLUMN IF NOT EXISTS formula            TEXT NULL AFTER calculation_type,
  ADD COLUMN IF NOT EXISTS base_reference     VARCHAR(100) NULL AFTER formula,
  ADD COLUMN IF NOT EXISTS percentage_value   DECIMAL(8,4) NULL AFTER base_reference,
  ADD COLUMN IF NOT EXISTS priority_order     INT DEFAULT 100 AFTER percentage_value,
  ADD COLUMN IF NOT EXISTS is_active          TINYINT(1) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_amount         DECIMAL(14,2) NULL,
  ADD COLUMN IF NOT EXISTS max_amount         DECIMAL(14,2) NULL,
  ADD COLUMN IF NOT EXISTS taxable            TINYINT(1) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS printable          TINYINT(1) DEFAULT 1;

-- ─── 2. Tasas IPS con vigencias ────────────────────────────────
CREATE TABLE IF NOT EXISTS ips_rates (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  description      VARCHAR(200) NOT NULL,
  employee_rate    DECIMAL(6,4) NOT NULL COMMENT 'Porcentaje empleado (ej: 9.0000)',
  employer_rate    DECIMAL(6,4) NOT NULL COMMENT 'Porcentaje patronal (ej: 16.5000)',
  effective_from   DATE NOT NULL,
  effective_to     DATE NULL COMMENT 'NULL = vigente actualmente',
  country          CHAR(2) DEFAULT 'PY',
  notes            TEXT NULL,
  created_by       INT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_effective_from (effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tasas históricas Paraguay
INSERT IGNORE INTO ips_rates (description, employee_rate, employer_rate, effective_from, effective_to) VALUES
  ('IPS Paraguay — Tasa histórica pre-2012', 9.0000, 14.0000, '2000-01-01', '2011-12-31'),
  ('IPS Paraguay — Ley 4933/2013',           9.0000, 16.5000, '2012-01-01', NULL);

-- ─── 3. Parámetros generales de nómina ─────────────────────────
CREATE TABLE IF NOT EXISTS payroll_parameters (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  company_id    INT NULL COMMENT 'NULL = global',
  param_key     VARCHAR(100) NOT NULL,
  param_value   VARCHAR(500) NOT NULL,
  param_type    ENUM('decimal','integer','string','boolean') DEFAULT 'decimal',
  description   VARCHAR(300) NULL,
  effective_from DATE NOT NULL DEFAULT (CURDATE()),
  effective_to   DATE NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_company_key_from (company_id, param_key, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Salario mínimo Paraguay (2025)
INSERT IGNORE INTO payroll_parameters (company_id, param_key, param_value, param_type, description, effective_from) VALUES
  (NULL, 'salary.minimum_wage',       '2700000',  'integer', 'Salario mínimo mensual PY (Gs.)', '2025-01-01'),
  (NULL, 'salary.minimum_daily',      '90000',    'integer', 'Jornal mínimo diario PY (Gs.)',   '2025-01-01'),
  (NULL, 'aguinaldo.divisor',         '12',       'integer', 'Divisor para cálculo aguinaldo',  '2000-01-01'),
  (NULL, 'vacation.base_days',        '12',       'integer', 'Días base de vacaciones por año', '2000-01-01'),
  (NULL, 'vacation.days_per_year_extra', '2',     'integer', 'Días adicionales por año trabajado (>5 años)', '2000-01-01'),
  (NULL, 'preaviso.min_days',         '30',       'integer', 'Días mínimos de preaviso',        '2000-01-01'),
  (NULL, 'indemnizacion.rate',        '15',       'integer', 'Días de sueldo por año para indemnización', '2000-01-01'),
  (NULL, 'ips.minimum_wage_ips',      '2700000',  'integer', 'Salario mínimo para base IPS',    '2025-01-01');

-- ─── 4. Actualizar conceptos existentes con calculation_type ────
UPDATE salary_concepts SET calculation_type = 'fixed', priority_order = 10
  WHERE code = 'SALARIO_BASE' OR name LIKE '%Salario Base%' OR name LIKE '%Sueldo Base%';

UPDATE salary_concepts SET
  calculation_type = 'percentage_base',
  percentage_value = 9.0000,
  base_reference   = 'ips_base',
  priority_order   = 200,
  affects_ips      = 0
WHERE code = 'IPS_EMPLEADO' OR name LIKE '%IPS Empleado%' OR name LIKE '%Aporte IPS Emp%';

UPDATE salary_concepts SET
  calculation_type = 'percentage_base',
  percentage_value = 16.5000,
  base_reference   = 'ips_base',
  priority_order   = 201,
  affects_ips      = 0
WHERE code = 'IPS_PATRONAL' OR name LIKE '%IPS Patronal%' OR name LIKE '%Patronal%';

-- ─── 5. payroll_items: agregar campos faltantes si no existen ───
ALTER TABLE payroll_items
  ADD COLUMN IF NOT EXISTS concept_code  VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS concept_type  ENUM('INCOME','DEDUCTION','CONTRIBUTION','PROVISION') NULL,
  ADD COLUMN IF NOT EXISTS affects_ips   TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_worked   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_worked  DECIMAL(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_amount   DECIMAL(14,2) NULL,
  ADD COLUMN IF NOT EXISTS is_ips_base   TINYINT(1) DEFAULT 0;

-- ─── 6. payroll_runs: agregar campos de control ─────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS status        ENUM('queued','calculating','calculated','reviewed','approved','paid','closed','cancelled') DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS started_at    DATETIME NULL,
  ADD COLUMN IF NOT EXISTS finished_at   DATETIME NULL,
  ADD COLUMN IF NOT EXISTS total_employees INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gross   DECIMAL(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_net     DECIMAL(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ips_employee DECIMAL(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ips_employer DECIMAL(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS queued_at     DATETIME NULL,
  ADD COLUMN IF NOT EXISTS queued_by     INT NULL;

-- ─── 7. Settings IPS ────────────────────────────────────────────
INSERT INTO settings (`key`, `value`, description, data_type, is_public) VALUES
  ('ips.employee_rate', '9',    'Tasa IPS empleado (%)', 'string', 0),
  ('ips.employer_rate', '16.5', 'Tasa IPS patronal (%)', 'string', 0)
ON DUPLICATE KEY UPDATE value = VALUES(value);
