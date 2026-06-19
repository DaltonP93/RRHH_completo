-- Migration 095: Employee contracts and bank accounts tables
-- These tables support the personas/contratos and bancos/cuentas-empleados pages.

CREATE TABLE IF NOT EXISTS employee_contracts (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id   INT NOT NULL,
  contract_type ENUM('INDEFINIDO','PLAZO_FIJO','TEMPORAL','PRACTICANTE','OBRA') NOT NULL DEFAULT 'INDEFINIDO',
  position_id   INT NULL,
  department_id INT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NULL,
  salary        DECIMAL(14,2) NULL,
  currency      VARCHAR(10)  NOT NULL DEFAULT 'PYG',
  status        ENUM('activo','vencido','pendiente','suspendido') NOT NULL DEFAULT 'activo',
  notes         TEXT NULL,
  created_by    INT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id    INT NOT NULL,
  bank_id        BIGINT NULL,
  bank_name      VARCHAR(150) NULL,
  account_type   ENUM('AHORRO','CORRIENTE','CAJA_AHORRO') NOT NULL DEFAULT 'AHORRO',
  account_number VARCHAR(50)  NOT NULL,
  currency       VARCHAR(10)  NOT NULL DEFAULT 'PYG',
  is_primary     TINYINT(1)   NOT NULL DEFAULT 0,
  status         ENUM('activa','inactiva') NOT NULL DEFAULT 'activa',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed existing bank account data from payment_batch_lines (last known account per employee)
INSERT IGNORE INTO employee_bank_accounts (employee_id, bank_id, account_type, account_number, is_primary, status)
SELECT
  pbl.employee_id,
  pbl.bank_id,
  pbl.account_type,
  pbl.bank_account_number,
  1,
  'activa'
FROM payment_batch_lines pbl
INNER JOIN (
  SELECT employee_id, MAX(id) AS max_id FROM payment_batch_lines
  WHERE bank_account_number IS NOT NULL AND bank_account_number != ''
  GROUP BY employee_id
) latest ON pbl.id = latest.max_id
WHERE pbl.bank_account_number IS NOT NULL AND pbl.bank_account_number != ''
ON DUPLICATE KEY UPDATE account_number = account_number;
