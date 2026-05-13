-- Settlement types
CREATE TABLE IF NOT EXISTS settlement_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO settlement_types (code, name) VALUES
  ('MENSUAL',           'Liquidación Mensual'),
  ('QUINCENAL',         'Liquidación Quincenal'),
  ('AGUINALDO',         'Aguinaldo'),
  ('VACACIONES',        'Vacaciones'),
  ('LIQUIDACION_FINAL', 'Liquidación Final');

-- Monthly parameters (salario mínimo, tasas IPS, etc.)
CREATE TABLE IF NOT EXISTS payroll_monthly_parameters (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  period_year SMALLINT NOT NULL,
  period_month TINYINT NOT NULL,
  salario_minimo DECIMAL(18,2) DEFAULT 0,
  jornal_minimo DECIMAL(18,2) DEFAULT 0,
  ips_employee_rate DECIMAL(6,4) DEFAULT 9.00,
  ips_employer_rate DECIMAL(6,4) DEFAULT 16.50,
  canasta_basica DECIMAL(18,2) DEFAULT 0,
  status ENUM('active','closed') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_period (company_id, period_year, period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payroll runs (liquidaciones)
CREATE TABLE IF NOT EXISTS payroll_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  branch_id BIGINT NULL,
  period_year SMALLINT NOT NULL,
  period_month TINYINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  settlement_type_id BIGINT NOT NULL,
  description VARCHAR(255),
  status ENUM('draft','calculating','calculated','review','approved','closed','cancelled') DEFAULT 'draft',
  generated_by INT NULL,
  generated_at DATETIME,
  approved_by INT NULL,
  approved_at DATETIME,
  closed_by INT NULL,
  closed_at DATETIME,
  posted_to_accounting TINYINT(1) DEFAULT 0,
  payment_batch_id BIGINT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (settlement_type_id) REFERENCES settlement_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employee settlements (detalle por empleado)
CREATE TABLE IF NOT EXISTS employee_settlements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  payroll_run_id BIGINT NOT NULL,
  employee_id INT NOT NULL,
  payroll_profile_id BIGINT NULL,
  worked_days DECIMAL(6,2) DEFAULT 0,
  absent_days DECIMAL(6,2) DEFAULT 0,
  ordinary_hours DECIMAL(8,2) DEFAULT 0,
  extra_hours_50 DECIMAL(8,2) DEFAULT 0,
  extra_hours_100 DECIMAL(8,2) DEFAULT 0,
  night_hours DECIMAL(8,2) DEFAULT 0,
  holiday_hours DECIMAL(8,2) DEFAULT 0,
  gross_income DECIMAL(18,2) DEFAULT 0,
  total_deductions DECIMAL(18,2) DEFAULT 0,
  ips_employee_amount DECIMAL(18,2) DEFAULT 0,
  ips_employer_amount DECIMAL(18,2) DEFAULT 0,
  net_pay DECIMAL(18,2) DEFAULT 0,
  payment_method ENUM('BANCO','EFECTIVO','CHEQUE') DEFAULT 'BANCO',
  bank_id BIGINT NULL,
  bank_account_number VARCHAR(50),
  status ENUM('draft','calculated','approved','paid','rejected') DEFAULT 'draft',
  receipt_document_id BIGINT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Settlement lines (conceptos por empleado)
CREATE TABLE IF NOT EXISTS settlement_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  settlement_id BIGINT NOT NULL,
  salary_concept_id BIGINT NOT NULL,
  line_type ENUM('INCOME','DEDUCTION','CONTRIBUTION','PROVISION') NOT NULL,
  quantity DECIMAL(10,4) DEFAULT 1,
  rate DECIMAL(18,4) DEFAULT 0,
  amount DECIMAL(18,2) NOT NULL,
  taxable_ips TINYINT(1) DEFAULT 0,
  affects_christmas_bonus TINYINT(1) DEFAULT 0,
  source_module VARCHAR(50),
  source_id BIGINT NULL,
  notes TEXT,
  FOREIGN KEY (settlement_id) REFERENCES employee_settlements(id),
  FOREIGN KEY (salary_concept_id) REFERENCES salary_concepts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
