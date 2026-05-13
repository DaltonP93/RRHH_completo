-- Document management module
CREATE TABLE IF NOT EXISTS document_folders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  parent_id BIGINT NULL,
  name VARCHAR(150) NOT NULL,
  module VARCHAR(100),
  status ENUM('active','inactive') DEFAULT 'active',
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE,
  module VARCHAR(100),
  version INT DEFAULT 1,
  canvas_json LONGTEXT,
  html_template LONGTEXT,
  dynamic_fields_schema JSON,
  description TEXT,
  status ENUM('draft','active','deprecated') DEFAULT 'draft',
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO document_templates (company_id, name, code, module, status, html_template) VALUES
(1, 'Contrato Laboral', 'CONTRATO_LABORAL', 'rrhh', 'active',
 '<h1>CONTRATO DE TRABAJO</h1><p>Entre <strong>{{company.legal_name}}</strong> y <strong>{{employee.full_name}}</strong>, CI: {{employee.document_number}}</p><p>Se establece relación laboral a partir del {{employee.hire_date}} para el cargo de {{employee.position}} con salario de {{employee.base_salary}} guaraníes mensuales.</p><br/><p>Firma empleado: {{signature.employee}}</p><p>Firma empresa: {{signature.hr}}</p><p>Fecha: {{date.today}}</p>'),
(1, 'Recibo de Salario', 'RECIBO_SALARIO', 'payroll', 'active',
 '<h2>RECIBO DE SALARIO</h2><p>Empleado: {{employee.full_name}}</p><p>Período: {{payroll.period}}</p><p>Salario Neto: {{payroll.net_pay}}</p><br/><p>Firma: {{signature.employee}}</p>'),
(1, 'Solicitud de Vacaciones', 'SOLICITUD_VACACIONES', 'vacations', 'active',
 '<h2>SOLICITUD DE VACACIONES</h2><p>Empleado: {{employee.full_name}}</p><p>Período: {{vacation.start_date}} al {{vacation.end_date}}</p><p>Firma: {{signature.employee}}</p>'),
(1, 'Autorización de Permiso', 'AUTORIZACION_PERMISO', 'leaves', 'active',
 '<h2>AUTORIZACIÓN DE PERMISO</h2><p>Empleado: {{employee.full_name}}</p><p>Motivo: {{leave.reason}}</p><p>Firma RRHH: {{signature.hr}}</p>');

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL DEFAULT 1,
  template_id BIGINT NULL,
  employee_id INT NOT NULL,
  folder_id BIGINT NULL,
  module VARCHAR(100),
  module_entity_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('draft','active','sent','viewed','in_review','corrected','signed','completed','archived','cancelled','expired') DEFAULT 'draft',
  current_version INT DEFAULT 1,
  original_document_id BIGINT NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  viewed_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (template_id) REFERENCES document_templates(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_versions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  document_id BIGINT NOT NULL,
  version_number INT NOT NULL,
  content_json LONGTEXT,
  rendered_html LONGTEXT,
  rendered_pdf_url VARCHAR(255),
  hash_sha256 VARCHAR(64),
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_recipients (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  document_id BIGINT NOT NULL,
  employee_id INT NULL,
  user_id INT NULL,
  recipient_type ENUM('SIGNER','REVIEWER','CC') DEFAULT 'SIGNER',
  status ENUM('pending','sent','viewed','signed','rejected') DEFAULT 'pending',
  viewed_at DATETIME,
  signed_at DATETIME,
  FOREIGN KEY (document_id) REFERENCES documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_signatures (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  document_id BIGINT NOT NULL,
  recipient_id BIGINT NOT NULL,
  signature_type ENUM('DRAWN','IMAGE','PASSWORD','OTP','2FA') NOT NULL,
  signature_image_url VARCHAR(255),
  signed_pdf_url VARCHAR(255),
  signed_hash_sha256 VARCHAR(64),
  signer_ip VARCHAR(45),
  signer_user_agent TEXT,
  signed_at DATETIME,
  validation_method VARCHAR(100),
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (recipient_id) REFERENCES document_recipients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  document_id BIGINT NOT NULL,
  author_user_id INT NULL,
  author_employee_id INT NULL,
  comment TEXT NOT NULL,
  visibility ENUM('INTERNAL','ALL') DEFAULT 'ALL',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  document_id BIGINT NOT NULL,
  action VARCHAR(100) NOT NULL,
  actor_user_id INT NULL,
  actor_employee_id INT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
