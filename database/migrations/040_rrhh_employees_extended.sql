-- Extend employees table with RRHH fields
-- MySQL 8 does not support ADD COLUMN IF NOT EXISTS, so we use a stored procedure.
DROP PROCEDURE IF EXISTS rrhh_add_employee_columns;

DELIMITER $$
CREATE PROCEDURE rrhh_add_employee_columns()
BEGIN
  DECLARE db_name VARCHAR(64) DEFAULT DATABASE();
  DECLARE tbl_name VARCHAR(64) DEFAULT 'employees';

  -- Helper macro: runs ALTER only when the column is absent
  -- company_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'company_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN company_id BIGINT DEFAULT 1;
  END IF;

  -- branch_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'branch_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN branch_id BIGINT DEFAULT 1;
  END IF;

  -- legacy_oracle_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'legacy_oracle_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN legacy_oracle_id VARCHAR(50) NULL;
  END IF;

  -- document_type
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'document_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN document_type ENUM('CI','RUC','PASAPORTE','OTRO') DEFAULT 'CI';
  END IF;

  -- document_number
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'document_number'
  ) THEN
    ALTER TABLE employees ADD COLUMN document_number VARCHAR(20);
  END IF;

  -- birth_date
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'birth_date'
  ) THEN
    ALTER TABLE employees ADD COLUMN birth_date DATE;
  END IF;

  -- gender
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'gender'
  ) THEN
    ALTER TABLE employees ADD COLUMN gender ENUM('M','F','OTRO');
  END IF;

  -- civil_status
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'civil_status'
  ) THEN
    ALTER TABLE employees ADD COLUMN civil_status ENUM('SOLTERO','CASADO','DIVORCIADO','VIUDO','UNION_LIBRE');
  END IF;

  -- nationality
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'nationality'
  ) THEN
    ALTER TABLE employees ADD COLUMN nationality VARCHAR(80) DEFAULT 'Paraguaya';
  END IF;

  -- address
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'address'
  ) THEN
    ALTER TABLE employees ADD COLUMN address TEXT;
  END IF;

  -- position_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'position_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN position_id BIGINT NULL;
  END IF;

  -- grade_level_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'grade_level_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN grade_level_id BIGINT NULL;
  END IF;

  -- cost_center_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'cost_center_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN cost_center_id BIGINT NULL;
  END IF;

  -- employee_type_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'employee_type_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN employee_type_id BIGINT NULL;
  END IF;

  -- bank_id
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'bank_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN bank_id BIGINT NULL;
  END IF;

  -- bank_account_number
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'bank_account_number'
  ) THEN
    ALTER TABLE employees ADD COLUMN bank_account_number VARCHAR(50);
  END IF;

  -- bank_account_type
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'bank_account_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN bank_account_type ENUM('CORRIENTE','AHORRO','CAJA_AHORRO') DEFAULT 'AHORRO';
  END IF;

  -- payment_method
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'payment_method'
  ) THEN
    ALTER TABLE employees ADD COLUMN payment_method ENUM('BANCO','EFECTIVO','CHEQUE') DEFAULT 'BANCO';
  END IF;

  -- ips_number
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'ips_number'
  ) THEN
    ALTER TABLE employees ADD COLUMN ips_number VARCHAR(30);
  END IF;

  -- mtess_worker_number
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'mtess_worker_number'
  ) THEN
    ALTER TABLE employees ADD COLUMN mtess_worker_number VARCHAR(30);
  END IF;

  -- termination_date
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'termination_date'
  ) THEN
    ALTER TABLE employees ADD COLUMN termination_date DATE NULL;
  END IF;

  -- termination_reason
  IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = db_name AND TABLE_NAME = tbl_name AND COLUMN_NAME = 'termination_reason'
  ) THEN
    ALTER TABLE employees ADD COLUMN termination_reason TEXT NULL;
  END IF;

END$$
DELIMITER ;

CALL rrhh_add_employee_columns();
DROP PROCEDURE IF EXISTS rrhh_add_employee_columns;

-- Family members
CREATE TABLE IF NOT EXISTS employee_family_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  relationship ENUM('CONYUGE','HIJO','HIJA','PADRE','MADRE','OTRO') NOT NULL,
  birth_date DATE,
  document_number VARCHAR(20),
  ips_beneficiary TINYINT(1) DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Academic titles catalogue
CREATE TABLE IF NOT EXISTS academic_titles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30),
  name VARCHAR(150) NOT NULL,
  level ENUM('PRIMARIA','SECUNDARIA','TECNICO','UNIVERSITARIO','POSTGRADO','MAESTRIA','DOCTORADO'),
  status ENUM('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employee academic history
CREATE TABLE IF NOT EXISTS employee_academic_titles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  title_id BIGINT NOT NULL,
  institution VARCHAR(200),
  graduation_year YEAR,
  verified TINYINT(1) DEFAULT 0,
  document_url VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (title_id) REFERENCES academic_titles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
