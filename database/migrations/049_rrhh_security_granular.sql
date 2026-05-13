-- Granular security: RBAC + ABAC + Field-level
CREATE TABLE IF NOT EXISTS security_modules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  icon VARCHAR(50),
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO security_modules (code, name, description) VALUES
('rrhh', 'RRHH Core', 'Gestión de empleados, cargos, departamentos'),
('attendance', 'Asistencia', 'Control de asistencia y horarios'),
('leaves', 'Permisos', 'Gestión de permisos y ausencias'),
('vacations', 'Vacaciones', 'Gestión de vacaciones'),
('payroll', 'Nómina', 'Liquidaciones y nómina'),
('banking', 'Bancos y Pagos', 'Planillas bancarias y pagos'),
('compliance', 'Cumplimiento', 'MTESS/REOP, IPS/REI'),
('documents', 'Documentos', 'Gestión documental y firma'),
('competencies', 'Competencias', 'Evaluación y competencias'),
('training', 'Capacitación', 'Cursos y planes de desarrollo'),
('notifications', 'Notificaciones', 'Administración de notificaciones'),
('security', 'Seguridad', 'Roles y permisos'),
('audit', 'Auditoría', 'Logs y trazabilidad'),
('reports', 'Reportes', 'Reportes y analítica'),
('admin', 'Administración', 'Configuración del sistema');

CREATE TABLE IF NOT EXISTS security_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  module_code VARCHAR(100) NOT NULL,
  action_code VARCHAR(100) NOT NULL,
  permission_code VARCHAR(220) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  risk_level ENUM('low','normal','high','critical') NOT NULL DEFAULT 'normal'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO security_permissions (module_code, action_code, permission_code, name, risk_level) VALUES
('rrhh','employee.view','rrhh.employee.view','Ver empleados','low'),
('rrhh','employee.create','rrhh.employee.create','Crear empleados','normal'),
('rrhh','employee.update','rrhh.employee.update','Editar empleados','normal'),
('rrhh','employee.delete','rrhh.employee.delete','Eliminar empleados','high'),
('rrhh','employee.view_salary','rrhh.employee.view_salary','Ver salarios','high'),
('rrhh','employee.edit_salary','rrhh.employee.edit_salary','Editar salarios','critical'),
('rrhh','employee.view_sensitive','rrhh.employee.view_sensitive','Ver datos sensibles','high'),
('attendance','punches.view','attendance.punches.view','Ver marcaciones','low'),
('attendance','punches.correct','attendance.punches.correct','Corregir marcaciones','normal'),
('attendance','overtime.approve','attendance.overtime.approve','Aprobar horas extras','normal'),
('leaves','request.view','leaves.request.view','Ver permisos','low'),
('leaves','request.create','leaves.request.create','Crear permisos','normal'),
('leaves','request.approve','leaves.request.approve','Aprobar permisos','normal'),
('vacations','request.view','vacations.request.view','Ver vacaciones','low'),
('vacations','request.create','vacations.request.create','Crear solicitud vacaciones','normal'),
('vacations','request.approve','vacations.request.approve','Aprobar vacaciones','normal'),
('payroll','run.view','payroll.run.view','Ver liquidaciones','normal'),
('payroll','run.generate','payroll.run.generate','Generar liquidación','high'),
('payroll','run.approve','payroll.run.approve','Aprobar liquidación','critical'),
('payroll','run.close','payroll.run.close','Cerrar período','critical'),
('payroll','concepts.manage','payroll.concepts.manage','Gestionar conceptos salariales','high'),
('banking','batch.view','banking.batch.view','Ver lotes de pago','normal'),
('banking','batch.generate','banking.batch.generate','Generar lote de pago','high'),
('banking','batch.approve','banking.batch.approve','Aprobar lote de pago','critical'),
('compliance','mtess.view','compliance.mtess.view','Ver comunicaciones MTESS','normal'),
('compliance','mtess.generate','compliance.mtess.generate','Generar comunicaciones MTESS','high'),
('compliance','ips.view','compliance.ips.view','Ver registros IPS','normal'),
('compliance','ips.generate','compliance.ips.generate','Generar reportes IPS','high'),
('documents','template.manage','documents.template.manage','Gestionar plantillas','normal'),
('documents','document.view','documents.document.view','Ver documentos','low'),
('documents','document.create','documents.document.create','Crear documentos','normal'),
('documents','document.sign','documents.document.sign','Firmar documentos','normal'),
('competencies','competency.manage','competencies.competency.manage','Gestionar competencias','normal'),
('competencies','evaluation.view','competencies.evaluation.view','Ver evaluaciones','low'),
('competencies','evaluation.conduct','competencies.evaluation.conduct','Realizar evaluaciones','normal'),
('competencies','gaps.view','competencies.gaps.view','Ver brechas','normal'),
('security','roles.manage','security.roles.manage','Gestionar roles','critical'),
('security','permissions.assign','security.permissions.assign','Asignar permisos','critical'),
('audit','logs.view','audit.logs.view','Ver logs de auditoría','normal'),
('reports','reports.view','reports.reports.view','Ver reportes','low'),
('reports','reports.export','reports.reports.export','Exportar reportes','normal');

CREATE TABLE IF NOT EXISTS security_roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  system_role TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_company_code (company_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO security_roles (id, company_id, code, name, description, system_role) VALUES
(1, NULL, 'SUPER_ADMIN', 'Super Administrador', 'Acceso total al sistema', 1),
(2, NULL, 'ADMIN_EMPRESA', 'Administrador de Empresa', 'Administración de empresa', 1),
(3, NULL, 'GERENTE_RRHH', 'Gerente de RRHH', 'Gestión completa de RRHH', 1),
(4, NULL, 'ANALISTA_RRHH', 'Analista de RRHH', 'Operaciones de RRHH', 1),
(5, NULL, 'JEFE_AREA', 'Jefe de Área', 'Gestión de su equipo', 1),
(6, NULL, 'TESORERIA', 'Tesorería', 'Pagos y liquidaciones financieras', 1),
(7, NULL, 'CONTABILIDAD', 'Contabilidad', 'Acceso contable', 1),
(8, NULL, 'AUDITOR', 'Auditor', 'Acceso de lectura y auditoría', 1),
(9, NULL, 'EMPLEADO', 'Empleado', 'Portal del colaborador', 1),
(10, NULL, 'SOPORTE_TI', 'Soporte TI', 'Soporte técnico del sistema', 1);

CREATE TABLE IF NOT EXISTS security_role_permissions (
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  allow_effect ENUM('allow','deny') NOT NULL DEFAULT 'allow',
  conditions_json JSON NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES security_roles(id),
  FOREIGN KEY (permission_id) REFERENCES security_permissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS security_user_roles (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL DEFAULT 1,
  branch_id BIGINT NULL,
  department_id BIGINT NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  assigned_by INT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id, company_id),
  FOREIGN KEY (role_id) REFERENCES security_roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS security_data_scopes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  module_code VARCHAR(100) NOT NULL,
  scope_type ENUM('global','company','branch','area','team','self','custom') NOT NULL,
  scope_value BIGINT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS security_field_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT NOT NULL,
  entity_name VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 1,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  mask_rule VARCHAR(100) NULL,
  UNIQUE KEY uq_field_perm (role_id, entity_name, field_name),
  FOREIGN KEY (role_id) REFERENCES security_roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Restrict salary visibility: EMPLEADO role cannot view salary by default
INSERT IGNORE INTO security_field_permissions (role_id, entity_name, field_name, can_view, can_edit, mask_rule)
SELECT id, 'employee', 'base_salary', 0, 0, 'HIDDEN' FROM security_roles WHERE code = 'EMPLEADO';

-- Restrict bank account number for JEFE_AREA: show only last 4 digits
INSERT IGNORE INTO security_field_permissions (role_id, entity_name, field_name, can_view, can_edit, mask_rule)
SELECT id, 'employee', 'bank_account_number', 0, 0, 'MASK_LAST_4' FROM security_roles WHERE code = 'JEFE_AREA';
