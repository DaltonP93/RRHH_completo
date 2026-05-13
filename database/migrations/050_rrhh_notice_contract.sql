-- Notice periods and terminations
CREATE TABLE IF NOT EXISTS notice_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO notice_types (company_id, code, name) VALUES
(1, 'VOLUNTARIO', 'Renuncia Voluntaria'),
(1, 'DESPIDO_JUSTIFICADO', 'Despido Justificado'),
(1, 'DESPIDO_INJUSTIFICADO', 'Despido Injustificado'),
(1, 'MUTUO_ACUERDO', 'Mutuo Acuerdo'),
(1, 'CONTRATO_VENCIDO', 'Vencimiento de Contrato');

CREATE TABLE IF NOT EXISTS termination_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  requires_indemnification TINYINT(1) DEFAULT 0,
  requires_notice TINYINT(1) DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO termination_types (company_id, code, name, requires_indemnification, requires_notice) VALUES
(1, 'RENUNCIA', 'Renuncia Voluntaria', 0, 1),
(1, 'DESPIDO_JUST', 'Despido Justificado', 0, 0),
(1, 'DESPIDO_INJUST', 'Despido Injustificado', 1, 1),
(1, 'MUTUO', 'Mutuo Acuerdo', 0, 0),
(1, 'FALLECIMIENTO', 'Fallecimiento', 0, 0),
(1, 'JUBILACION', 'Jubilación', 0, 0);

CREATE TABLE IF NOT EXISTS notice_periods (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  notice_type_id BIGINT NOT NULL,
  termination_type_id BIGINT NULL,
  notice_date DATE NOT NULL,
  expected_last_day DATE,
  actual_last_day DATE,
  indemnification_amount DECIMAL(18,2) DEFAULT 0,
  notice_payment DECIMAL(18,2) DEFAULT 0,
  vacation_pending_payment DECIMAL(18,2) DEFAULT 0,
  christmas_bonus_payment DECIMAL(18,2) DEFAULT 0,
  total_liquidation DECIMAL(18,2) DEFAULT 0,
  payroll_run_id BIGINT NULL,
  document_id BIGINT NULL,
  status ENUM('draft','processing','completed','cancelled') DEFAULT 'draft',
  notes TEXT,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (notice_type_id) REFERENCES notice_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
