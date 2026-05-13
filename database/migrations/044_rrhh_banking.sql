-- Bank file layouts (configurable per bank)
CREATE TABLE IF NOT EXISTS bank_file_layouts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  bank_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  format_type ENUM('CSV','XLSX','TXT_FIXED','TXT_DELIMITED','API') NOT NULL,
  version VARCHAR(20) DEFAULT '1.0',
  delimiter VARCHAR(5) DEFAULT ',',
  encoding VARCHAR(20) DEFAULT 'UTF-8',
  has_header TINYINT(1) DEFAULT 1,
  active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bank_id) REFERENCES banks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Column-level field definitions for each layout
CREATE TABLE IF NOT EXISTS bank_file_layout_fields (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  layout_id BIGINT NOT NULL,
  field_order INT NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  header_label VARCHAR(100),
  source_expression VARCHAR(255),
  field_length INT,
  padding_char VARCHAR(5) DEFAULT ' ',
  alignment ENUM('LEFT','RIGHT') DEFAULT 'LEFT',
  required TINYINT(1) DEFAULT 1,
  validation_regex VARCHAR(255),
  FOREIGN KEY (layout_id) REFERENCES bank_file_layouts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment batches (lotes de pago)
CREATE TABLE IF NOT EXISTS payment_batches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  bank_id BIGINT NOT NULL,
  layout_id BIGINT NULL,
  payroll_run_id BIGINT NULL,
  payment_date DATE NOT NULL,
  currency_id VARCHAR(10) DEFAULT 'PYG',
  total_amount DECIMAL(18,2) DEFAULT 0,
  total_records INT DEFAULT 0,
  status ENUM('draft','validated','approved','generated','uploaded','confirmed','rejected') DEFAULT 'draft',
  generated_file_url VARCHAR(255),
  generated_by INT NULL,
  generated_at DATETIME,
  approved_by INT NULL,
  approved_at DATETIME,
  bank_response_file_url VARCHAR(255),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (bank_id) REFERENCES banks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Individual credit lines within a payment batch
CREATE TABLE IF NOT EXISTS payment_batch_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  payment_batch_id BIGINT NOT NULL,
  employee_id INT NOT NULL,
  settlement_id BIGINT NULL,
  document_number VARCHAR(20),
  full_name VARCHAR(200),
  bank_id BIGINT NULL,
  bank_account_number VARCHAR(50),
  account_type ENUM('CORRIENTE','AHORRO','CAJA_AHORRO') DEFAULT 'AHORRO',
  amount DECIMAL(18,2) NOT NULL,
  currency_id VARCHAR(10) DEFAULT 'PYG',
  concept VARCHAR(255),
  reference VARCHAR(100),
  status ENUM('pending','processed','rejected','returned') DEFAULT 'pending',
  error_message TEXT,
  FOREIGN KEY (payment_batch_id) REFERENCES payment_batches(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
