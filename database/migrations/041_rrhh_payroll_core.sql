-- Banks catalogue
CREATE TABLE IF NOT EXISTS banks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(50) DEFAULT 'Paraguay',
  swift_code VARCHAR(20),
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO banks (code, name) VALUES
  ('GNB',         'Banco GNB Paraguay'),
  ('ITAU',        'Banco Itaú Paraguay'),
  ('UENO',        'ueno bank'),
  ('FAMILIAR',    'Banco Familiar'),
  ('CONTINENTAL', 'Banco Continental'),
  ('BASA',        'Banco Basa'),
  ('SUDAMERIS',   'Sudameris Bank'),
  ('VISION',      'Visión Banco'),
  ('ATLAS',       'Banco Atlas'),
  ('REGIONAL',    'Banco Regional'),
  ('NACIONAL',    'Banco Nacional de Fomento');

-- Payroll profiles (salary configuration per employee)
CREATE TABLE IF NOT EXISTS payroll_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  currency_id VARCHAR(10) DEFAULT 'PYG',
  base_salary DECIMAL(18,2) NOT NULL DEFAULT 0,
  payment_frequency ENUM('MENSUAL','QUINCENAL','SEMANAL') DEFAULT 'MENSUAL',
  payment_method ENUM('BANCO','EFECTIVO','CHEQUE') DEFAULT 'BANCO',
  bank_id BIGINT NULL,
  bank_account_number VARCHAR(50),
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (bank_id) REFERENCES banks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Salary change history
CREATE TABLE IF NOT EXISTS salary_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  previous_salary DECIMAL(18,2),
  new_salary DECIMAL(18,2) NOT NULL,
  change_date DATE NOT NULL,
  reason TEXT,
  changed_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Salary concept groups
CREATE TABLE IF NOT EXISTS salary_concept_groups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30),
  name VARCHAR(150) NOT NULL,
  concept_type ENUM('INCOME','DEDUCTION','CONTRIBUTION','PROVISION') NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Salary concepts catalogue
CREATE TABLE IF NOT EXISTS salary_concepts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  group_id BIGINT NULL,
  legacy_oracle_id VARCHAR(50),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  concept_type ENUM('INCOME','DEDUCTION','CONTRIBUTION','PROVISION') NOT NULL,
  amount DECIMAL(18,2) DEFAULT 0,
  percentage DECIMAL(8,4) DEFAULT 0,
  currency_id VARCHAR(10) DEFAULT 'PYG',
  affects_ips TINYINT(1) DEFAULT 0,
  affects_christmas_bonus TINYINT(1) DEFAULT 0,
  affects_day TINYINT(1) DEFAULT 1,
  printable TINYINT(1) DEFAULT 1,
  accounting_debit_account VARCHAR(30),
  accounting_credit_account VARCHAR(30),
  status ENUM('active','inactive') DEFAULT 'active',
  valid_from DATE,
  valid_to DATE,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO salary_concepts
  (company_id, code, name, concept_type, affects_ips, affects_christmas_bonus, affects_day) VALUES
  (1, 'SALARIO_BASE',        'Salario Base',                    'INCOME',       1, 1, 1),
  (1, 'HORAS_EXTRA_50',      'Horas Extraordinarias 50%',       'INCOME',       1, 1, 1),
  (1, 'HORAS_EXTRA_100',     'Horas Extraordinarias 100%',      'INCOME',       1, 1, 1),
  (1, 'BONIFICACION_FAMILIAR','Bonificación Familiar',          'INCOME',       0, 0, 0),
  (1, 'APORTE_IPS_OBRERO',   'Aporte IPS Obrero (9%)',          'DEDUCTION',    0, 0, 0),
  (1, 'RETENCION_JUDICIAL',  'Retención Judicial',              'DEDUCTION',    0, 0, 0),
  (1, 'ANTICIPO_SALARIO',    'Anticipo de Salario',             'DEDUCTION',    0, 0, 0),
  (1, 'ANTICIPO_AGUINALDO',  'Anticipo de Aguinaldo',           'DEDUCTION',    0, 0, 0),
  (1, 'APORTE_IPS_PATRONAL', 'Aporte IPS Patronal (16.5%)',     'CONTRIBUTION', 0, 0, 0);

-- Fixed concepts assigned to individual employees
CREATE TABLE IF NOT EXISTS employee_fixed_concepts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  salary_concept_id BIGINT NOT NULL,
  amount DECIMAL(18,2) DEFAULT 0,
  percentage DECIMAL(8,4) DEFAULT 0,
  valid_from DATE,
  valid_to DATE,
  status ENUM('active','inactive') DEFAULT 'active',
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (salary_concept_id) REFERENCES salary_concepts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
