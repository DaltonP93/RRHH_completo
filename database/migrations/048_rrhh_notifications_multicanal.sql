-- Multicanal notification engine
CREATE TABLE IF NOT EXISTS notification_channels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  config_json JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO notification_channels (code, name, enabled) VALUES
('INTERNAL', 'Notificación Interna', 1),
('EMAIL', 'Correo Electrónico', 1),
('WHATSAPP', 'WhatsApp', 0),
('TELEGRAM', 'Telegram Bot', 0),
('SMS', 'SMS', 0),
('PUSH_WEB', 'Push Web/PWA', 1),
('WEBHOOK', 'Webhook Saliente', 0);

CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NULL,
  channel_code VARCHAR(50) NOT NULL,
  event_code VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  subject_template VARCHAR(255) NULL,
  body_template TEXT NOT NULL,
  variables_json JSON NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'es',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_event_channel_company (company_id, event_code, channel_code, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO notification_templates (company_id, channel_code, event_code, name, subject_template, body_template) VALUES
(NULL, 'INTERNAL', 'EMPLOYEE_CREATED', 'Nuevo empleado registrado', NULL,
 'El empleado {{employee.full_name}} ha sido registrado en el sistema.'),
(NULL, 'EMAIL', 'EMPLOYEE_CREATED', 'Nuevo empleado - Email', 'Bienvenido {{employee.first_name}}',
 'Estimado/a {{employee.full_name}},\n\nSe ha creado su cuenta en el sistema de RRHH. Su código de empleado es {{employee.code}}.\n\nSaludos,\n{{company.trade_name}}'),
(NULL, 'INTERNAL', 'LEAVE_REQUEST_CREATED', 'Solicitud de permiso pendiente', NULL,
 '{{employee.full_name}} ha solicitado un permiso. Pendiente de aprobación.'),
(NULL, 'INTERNAL', 'LEAVE_REQUEST_APPROVED', 'Permiso aprobado', NULL,
 'Su solicitud de permiso ha sido aprobada.'),
(NULL, 'INTERNAL', 'VACATION_REQUEST_CREATED', 'Solicitud de vacaciones pendiente', NULL,
 '{{employee.full_name}} ha solicitado vacaciones del {{vacation.start_date}} al {{vacation.end_date}}.'),
(NULL, 'INTERNAL', 'PAYROLL_RUN_GENERATED', 'Liquidación generada', NULL,
 'La liquidación del período {{payroll.period}} ha sido generada y está lista para revisión.'),
(NULL, 'INTERNAL', 'PAYROLL_RUN_APPROVED', 'Liquidación aprobada', NULL,
 'La liquidación del período {{payroll.period}} ha sido aprobada.'),
(NULL, 'INTERNAL', 'DOCUMENT_SENT', 'Documento pendiente de firma', NULL,
 'Tiene un documento pendiente de firma: {{document.title}}.'),
(NULL, 'INTERNAL', 'DOCUMENT_SIGNED', 'Documento firmado', NULL,
 '{{employee.full_name}} ha firmado el documento {{document.title}}.'),
(NULL, 'INTERNAL', 'EVALUATION_PENDING', 'Evaluación pendiente', NULL,
 'Tiene una evaluación de competencias pendiente para el ciclo {{cycle.name}}.'),
(NULL, 'INTERNAL', 'COMPLIANCE_DUE', 'Vencimiento de cumplimiento regulatorio', NULL,
 'Atención: {{compliance.description}} vence el {{compliance.due_date}}.'),
(NULL, 'INTERNAL', 'CONTRACT_EXPIRING', 'Contrato próximo a vencer', NULL,
 'El contrato de {{employee.full_name}} vence el {{contract.expiry_date}}.'),
(NULL, 'INTERNAL', 'BIRTHDAY', 'Cumpleaños de empleado', NULL,
 'Hoy es el cumpleaños de {{employee.full_name}}. ¡Felicitaciones!'),
(NULL, 'INTERNAL', 'PAYMENT_PROCESSED', 'Pago procesado', NULL,
 'El lote de pago del {{payment.date}} por {{payment.total_amount}} ha sido procesado.');

CREATE TABLE IF NOT EXISTS notification_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_code VARCHAR(100) NOT NULL,
  module_code VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NULL,
  entity_id BIGINT NULL,
  payload_json JSON NOT NULL,
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status ENUM('pending','processing','processed','failed') NOT NULL DEFAULT 'pending',
  created_by BIGINT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  INDEX idx_status (status),
  INDEX idx_event_code (event_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id BIGINT NOT NULL,
  recipient_user_id BIGINT NULL,
  recipient_employee_id BIGINT NULL,
  channel_code VARCHAR(50) NOT NULL,
  recipient_address VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NULL,
  body TEXT NOT NULL,
  status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  failed_at DATETIME NULL,
  error_message TEXT NULL,
  provider_message_id VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES notification_events(id),
  INDEX idx_status_scheduled (status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  employee_id BIGINT NULL,
  event_code VARCHAR(100) NOT NULL,
  channel_code VARCHAR(50) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  quiet_hours_start TIME NULL,
  quiet_hours_end TIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pref (user_id, employee_id, event_code, channel_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  queue_id BIGINT NOT NULL,
  provider VARCHAR(100) NULL,
  request_payload JSON NULL,
  response_payload JSON NULL,
  http_status INT NULL,
  status ENUM('success','failed') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (queue_id) REFERENCES notification_queue(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Internal notifications (shown in notification bell)
CREATE TABLE IF NOT EXISTS internal_notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  employee_id INT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info','success','warning','error') DEFAULT 'info',
  module VARCHAR(100),
  entity_type VARCHAR(100),
  entity_id BIGINT NULL,
  action_url VARCHAR(255),
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_read (user_id, read_at),
  INDEX idx_employee_read (employee_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
