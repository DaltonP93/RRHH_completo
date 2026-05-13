-- Social security rates (IPS parametrizable)
CREATE TABLE IF NOT EXISTS social_security_rates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  country VARCHAR(50) DEFAULT 'Paraguay',
  institution VARCHAR(100) NOT NULL,
  regime VARCHAR(100),
  employee_rate DECIMAL(6,4) NOT NULL,
  employer_rate DECIMAL(6,4) NOT NULL,
  total_rate DECIMAL(6,4) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  source_reference TEXT,
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO social_security_rates (institution, regime, employee_rate, employer_rate, total_rate, valid_from, status) VALUES
('IPS', 'Régimen General', 9.00, 16.50, 25.50, '2020-01-01', 'active');

-- MTESS/REOP compliance records
CREATE TABLE IF NOT EXISTS mtess_communications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  communication_type ENUM('ALTA','BAJA','VACACIONES','PERMISO','SUSPENSION','ACCIDENTE','LIQUIDACION','AGUINALDO','PLANILLA_ANUAL','AMONESTACION') NOT NULL,
  period_year SMALLINT,
  period_month TINYINT,
  employee_id INT NULL,
  reference_id BIGINT NULL,
  reference_module VARCHAR(50),
  status ENUM('pending','generated','submitted','accepted','rejected','corrected') DEFAULT 'pending',
  submission_date DATE,
  acceptance_date DATE,
  rejection_reason TEXT,
  file_url VARCHAR(255),
  comprobante_url VARCHAR(255),
  notes TEXT,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- IPS/REI records
CREATE TABLE IF NOT EXISTS ips_rei_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  period_year SMALLINT NOT NULL,
  period_month TINYINT NOT NULL,
  employee_id INT NOT NULL,
  payroll_run_id BIGINT NULL,
  taxable_salary DECIMAL(18,2) DEFAULT 0,
  employee_contribution DECIMAL(18,2) DEFAULT 0,
  employer_contribution DECIMAL(18,2) DEFAULT 0,
  total_contribution DECIMAL(18,2) DEFAULT 0,
  status ENUM('pending','calculated','submitted','paid') DEFAULT 'pending',
  submission_date DATE,
  UNIQUE KEY uq_ips_period_employee (company_id, period_year, period_month, employee_id),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Labor planillas (REOP annual)
CREATE TABLE IF NOT EXISTS labor_planillas (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  planilla_type ENUM('EMPLEADOS_OBREROS','SUELDOS_JORNALES','RESUMEN_PERSONAS') NOT NULL,
  period_year SMALLINT NOT NULL,
  status ENUM('pending','generated','validated','submitted','accepted','rejected','corrected') DEFAULT 'pending',
  generated_at DATETIME,
  submitted_at DATETIME,
  accepted_at DATETIME,
  file_url VARCHAR(255),
  comprobante_url VARCHAR(255),
  version INT DEFAULT 1,
  observations TEXT,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Compliance status dashboard
CREATE TABLE IF NOT EXISTS compliance_status (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  status ENUM('CUMPLE','NO_CUMPLE','EN_REVISION','OBSERVADO') DEFAULT 'EN_REVISION',
  last_evaluated_at DATETIME,
  planillas_ok TINYINT(1) DEFAULT 0,
  comunicaciones_ok TINYINT(1) DEFAULT 0,
  liquidaciones_ok TINYINT(1) DEFAULT 0,
  aguinaldo_ok TINYINT(1) DEFAULT 0,
  datos_patronales_ok TINYINT(1) DEFAULT 0,
  observations TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO compliance_status (company_id, status) VALUES (1, 'EN_REVISION');
