-- Migración 026: banco de horas (acumulación y canje de horas extra)

CREATE TABLE IF NOT EXISTS overtime_transactions (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  employee_id     INT NOT NULL,
  type            ENUM('deposit','redeem','adjustment','expire') NOT NULL,
  minutes         INT NOT NULL,                                   -- positivo = ingresa al banco, negativo = sale
  reference_date  DATE NULL,                                      -- día al que aplica (depósito desde ds.date, canje a fecha de uso)
  reason          VARCHAR(255) NULL,
  permission_id   INT NULL,                                       -- si fue canje contra un permiso
  created_by      INT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id)   REFERENCES employees(id)   ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)    REFERENCES users(id),
  INDEX idx_emp_date (employee_id, created_at),
  INDEX idx_emp_ref  (employee_id, reference_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
