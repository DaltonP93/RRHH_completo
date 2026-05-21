USE asistencia;

CREATE TABLE IF NOT EXISTS companies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255) NULL,
  ruc VARCHAR(50) NULL,
  patronal_number_mtess VARCHAR(80) NULL,
  patronal_number_ips VARCHAR(80) NULL,
  address VARCHAR(500) NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(180) NULL,
  status ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_companies_status (status),
  INDEX idx_companies_ruc (ruc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(50) NULL,
  address VARCHAR(500) NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(180) NULL,
  manager_id INT NULL,
  status ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branches_company (company_id),
  INDEX idx_branches_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grade_levels (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NULL,
  description TEXT NULL,
  min_salary DECIMAL(15,2) NULL,
  max_salary DECIMAL(15,2) NULL,
  status ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grade_company (company_id),
  INDEX idx_grade_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cost_centers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NULL,
  description TEXT NULL,
  status ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cc_company (company_id),
  INDEX idx_cc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NULL,
  description TEXT NULL,
  status ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_et_company (company_id),
  INDEX idx_et_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS positions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(50) NULL,
  company_id INT NULL,
  department_id INT NULL,
  grade_level_id INT NULL,
  cost_center_id INT NULL,
  description TEXT NULL,
  min_salary DECIMAL(15,2) NULL,
  max_salary DECIMAL(15,2) NULL,
  status ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_positions_company (company_id),
  INDEX idx_positions_department (department_id),
  INDEX idx_positions_grade (grade_level_id),
  INDEX idx_positions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO companies
(id, legal_name, trade_name, ruc, status)
VALUES
(1, 'Empresa Principal', 'Empresa Principal', NULL, 'active')
ON DUPLICATE KEY UPDATE
  legal_name = VALUES(legal_name),
  trade_name = VALUES(trade_name),
  status = VALUES(status);

INSERT INTO branches
(id, company_id, name, code, status)
VALUES
(1, 1, 'Casa Central', 'CENTRAL', 'active')
ON DUPLICATE KEY UPDATE
  company_id = VALUES(company_id),
  name = VALUES(name),
  code = VALUES(code),
  status = VALUES(status);

INSERT INTO grade_levels
(id, company_id, name, code, status)
VALUES
(1, 1, 'General', 'GEN', 'active')
ON DUPLICATE KEY UPDATE
  company_id = VALUES(company_id),
  name = VALUES(name),
  code = VALUES(code),
  status = VALUES(status);
