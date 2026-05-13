-- Positions, grade levels, cost centers
CREATE TABLE IF NOT EXISTS positions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  is_leadership TINYINT(1) DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grade_levels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30),
  name VARCHAR(150) NOT NULL,
  base_salary_min DECIMAL(18,2) DEFAULT 0,
  base_salary_max DECIMAL(18,2) DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cost_centers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  accounting_code VARCHAR(50),
  status ENUM('active','inactive') DEFAULT 'active',
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  code VARCHAR(30),
  name VARCHAR(100) NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO employee_types (id, company_id, code, name) VALUES
  (1, 1, 'EMPLEADO',    'Empleado'),
  (2, 1, 'OBRERO',      'Obrero'),
  (3, 1, 'CONTRATADO',  'Contratado'),
  (4, 1, 'PRACTICANTE', 'Practicante');
