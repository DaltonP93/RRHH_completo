-- Companies and branches for multi-company support
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  legal_name VARCHAR(200) NOT NULL,
  trade_name VARCHAR(200),
  ruc VARCHAR(20) UNIQUE NOT NULL,
  patronal_number_mtess VARCHAR(50),
  patronal_number_ips VARCHAR(50),
  address TEXT,
  phone VARCHAR(30),
  email VARCHAR(150),
  logo_url VARCHAR(255),
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(20),
  address TEXT,
  phone VARCHAR(30),
  cost_center_code VARCHAR(50),
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default company
INSERT IGNORE INTO companies (id, legal_name, trade_name, ruc, status)
  VALUES (1, 'Empresa Principal', 'Empresa Principal', '80000001-0', 'active');

INSERT IGNORE INTO branches (id, company_id, name, code, status)
  VALUES (1, 1, 'Sede Central', 'HQ', 'active');
