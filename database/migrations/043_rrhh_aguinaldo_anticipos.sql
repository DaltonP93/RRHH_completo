-- Christmas bonus (aguinaldo) runs
CREATE TABLE IF NOT EXISTS christmas_bonus_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  year SMALLINT NOT NULL,
  status ENUM('draft','calculating','calculated','approved','paid','cancelled') DEFAULT 'draft',
  generated_at DATETIME,
  approved_at DATETIME,
  payment_date DATE,
  mtess_report_status ENUM('pending','generated','submitted','accepted') DEFAULT 'pending',
  total_amount DECIMAL(18,2) DEFAULT 0,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_year_company (company_id, year),
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Christmas bonus lines (detalle por empleado)
CREATE TABLE IF NOT EXISTS christmas_bonus_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  christmas_bonus_run_id BIGINT NOT NULL,
  employee_id INT NOT NULL,
  months_worked DECIMAL(4,2) DEFAULT 12,
  accrued_remuneration DECIMAL(18,2) DEFAULT 0,
  calculated_amount DECIMAL(18,2) DEFAULT 0,
  advance_amount DECIMAL(18,2) DEFAULT 0,
  paid_amount DECIMAL(18,2) DEFAULT 0,
  payment_date DATE,
  document_id BIGINT NULL,
  status ENUM('calculated','approved','paid') DEFAULT 'calculated',
  FOREIGN KEY (christmas_bonus_run_id) REFERENCES christmas_bonus_runs(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Salary advance types
CREATE TABLE IF NOT EXISTS salary_advance_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO salary_advance_types (company_id, code, name) VALUES
  (1, 'SALARY',          'Anticipo de Salario'),
  (1, 'CHRISTMAS_BONUS', 'Anticipo de Aguinaldo');

-- Salary advances (anticipos)
CREATE TABLE IF NOT EXISTS salary_advances (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  salary_advance_type_id BIGINT NOT NULL,
  request_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency_id VARCHAR(10) DEFAULT 'PYG',
  reason TEXT,
  status ENUM('pending','approved','rejected','liquidated') DEFAULT 'pending',
  approved_by INT NULL,
  approved_at DATETIME,
  payroll_run_id BIGINT NULL,
  liquidated TINYINT(1) DEFAULT 0,
  document_id BIGINT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (salary_advance_type_id) REFERENCES salary_advance_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
