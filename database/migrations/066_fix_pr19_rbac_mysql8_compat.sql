USE asistencia;

DELIMITER $$

DROP PROCEDURE IF EXISTS add_col_if_missing $$
CREATE PROCEDURE add_col_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

-- 1) Permitir roles nuevos en users.role
ALTER TABLE users
  MODIFY COLUMN role VARCHAR(80) NOT NULL DEFAULT 'employee';

-- 2) Columnas requeridas en users
CALL add_col_if_missing('users', 'twofa_secret', 'VARCHAR(255) NULL');
CALL add_col_if_missing('users', 'twofa_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_col_if_missing('users', 'password_changed_at', 'DATETIME NULL');
CALL add_col_if_missing('users', 'must_change_password', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_col_if_missing('users', 'last_login', 'DATETIME NULL');
CALL add_col_if_missing('users', 'photo_url', 'VARCHAR(500) NULL');

-- 3) Settings
CREATE TABLE IF NOT EXISTS notification_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(150) NOT NULL UNIQUE,
  setting_value TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  key_name VARCHAR(150) NOT NULL UNIQUE,
  value TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Auditoría compatible con código actual
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  username VARCHAR(100) NULL,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(120) NULL,
  entity_id VARCHAR(120) NULL,
  details JSON NULL,
  ip VARCHAR(80) NULL,
  ip_address VARCHAR(80) NULL,
  user_agent TEXT NULL,
  request_id VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ae_user (user_id),
  INDEX idx_ae_action (action),
  INDEX idx_ae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL add_col_if_missing('audit_events', 'ip', 'VARCHAR(80) NULL');
CALL add_col_if_missing('audit_events', 'ip_address', 'VARCHAR(80) NULL');
CALL add_col_if_missing('audit_events', 'user_agent', 'TEXT NULL');
CALL add_col_if_missing('audit_events', 'request_id', 'VARCHAR(100) NULL');

-- 5) Notificaciones usuario
CREATE TABLE IF NOT EXISTS user_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  module VARCHAR(100) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_update TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_module (user_id, module),
  INDEX idx_up_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(80) DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  link VARCHAR(500) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_un_user_read (user_id, read_at),
  INDEX idx_un_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6) RBAC/ABAC
CREATE TABLE IF NOT EXISTS roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  level INT NOT NULL DEFAULT 100,
  is_system TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions_catalog (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL UNIQUE,
  module_code VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_sensitive TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  allowed TINYINT(1) DEFAULT 1,
  PRIMARY KEY (role_id, permission_id),
  INDEX idx_rp_role (role_id),
  INDEX idx_rp_perm (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No usar company_id/branch_id nullable dentro de PRIMARY KEY
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  company_id INT NULL,
  branch_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_role_scope (user_id, role_id, company_id, branch_id),
  INDEX idx_ur_user (user_id),
  INDEX idx_ur_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_scopes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  scope_type ENUM('global','company','branch','department','team','own') NOT NULL,
  company_id INT NULL,
  branch_id INT NULL,
  department_id INT NULL,
  employee_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_us_user (user_id),
  INDEX idx_us_scope (scope_type, company_id, branch_id, department_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS field_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id INT NOT NULL,
  entity VARCHAR(80) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  can_view TINYINT(1) DEFAULT 0,
  can_update TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fp (role_id, entity, field_name),
  INDEX idx_fp_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS module_catalog (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  icon VARCHAR(80) NULL,
  route VARCHAR(180) NULL,
  status ENUM('available','configuring','pending_migration','requires_permission','error','disabled') DEFAULT 'available',
  required_permission VARCHAR(120) NULL,
  sort_order INT DEFAULT 100,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS module_menu_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  module_code VARCHAR(80) NOT NULL,
  label VARCHAR(150) NOT NULL,
  route VARCHAR(180) NOT NULL,
  required_permission VARCHAR(120) NULL,
  sort_order INT DEFAULT 100,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mmi_module (module_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7) Roles base
INSERT INTO roles (code, name, description, level, is_system)
VALUES
('super_admin', 'Super Administrador', 'Acceso global total a la plataforma', 1, 1),
('platform_admin', 'Administrador Plataforma', 'Administrador técnico de plataforma', 5, 1),
('company_admin', 'Administrador de Empresa', 'Administra una empresa específica', 10, 1),
('hr_admin', 'Administrador RRHH', 'Administra RRHH dentro de su alcance', 20, 1),
('hr_operator', 'Operador RRHH', 'Operador de RRHH', 25, 1),
('payroll_admin', 'Administrador Nómina', 'Administra nómina y liquidaciones', 30, 1),
('payroll_operator', 'Operador Nómina', 'Operador de nómina', 32, 1),
('treasury_admin', 'Administrador Tesorería', 'Administra pagos y bancos', 35, 1),
('compliance_admin', 'Administrador Cumplimiento', 'Gestiona cumplimiento legal', 40, 1),
('document_admin', 'Administrador Documental', 'Gestiona documentos', 42, 1),
('competency_admin', 'Administrador Competencias', 'Gestiona competencias', 45, 1),
('supervisor', 'Supervisor', 'Gestiona su equipo', 50, 1),
('auditor', 'Auditor', 'Consulta y auditoría', 90, 1),
('readonly', 'Solo Lectura', 'Acceso solo lectura', 95, 1),
('employee', 'Empleado', 'Acceso autoservicio', 100, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  level = VALUES(level),
  is_system = VALUES(is_system);

-- 8) Permisos base
INSERT INTO permissions_catalog (code, module_code, action, name, description, is_sensitive)
VALUES
('people.view','people','view','Ver Personas','Ver módulo personas',0),
('people.create','people','create','Crear Personas','Crear empleados/personas',0),
('people.update','people','update','Editar Personas','Editar empleados/personas',0),
('people.delete','people','delete','Eliminar Personas','Eliminar empleados/personas',1),
('employees.sensitive.view','people','view_sensitive','Ver datos sensibles','Ver datos sensibles de empleados',1),
('employees.salary.view','people','view_salary','Ver salario','Ver salario de empleados',1),
('employees.bank.view','people','view_bank','Ver banco','Ver datos bancarios',1),

('attendance.view','attendance','view','Ver Asistencia','Ver asistencia',0),
('attendance.create','attendance','create','Crear Asistencia','Crear marcaciones',0),
('attendance.update','attendance','update','Editar Asistencia','Editar asistencia',1),
('attendance.manual.create','attendance','manual_create','Crear marcación manual','Crear marcación manual',1),
('attendance.manual.approve','attendance','manual_approve','Aprobar marcación manual','Aprobar marcación manual',1),
('attendance.realtime.view','attendance','realtime','Ver tiempo real','Ver asistencia en tiempo real',0),
('devices.view','attendance','devices_view','Ver relojes','Ver relojes',0),
('devices.manage','attendance','devices_manage','Gestionar relojes','Gestionar relojes',1),
('sync.att2000.view','attendance','sync_view','Ver att2000','Ver importación att2000',0),
('sync.att2000.run','attendance','sync_run','Ejecutar importación att2000','Importar att2000',1),
('sync.att2000.reconcile','attendance','sync_reconcile','Reconciliar att2000','Reconciliar att2000',1),

('payroll.view','payroll','view','Ver Nómina','Ver nómina',1),
('payroll.calculate','payroll','calculate','Calcular Nómina','Calcular nómina',1),
('payroll.approve','payroll','approve','Aprobar Nómina','Aprobar nómina',1),
('payroll.close','payroll','close','Cerrar Nómina','Cerrar nómina',1),
('payroll.export','payroll','export','Exportar Nómina','Exportar nómina',1),

('payments.view','payments','view','Ver Pagos','Ver pagos',1),
('payments.create','payments','create','Crear Pagos','Crear pagos',1),
('payments.approve','payments','approve','Aprobar Pagos','Aprobar pagos',1),
('payments.export','payments','export','Exportar Pagos','Exportar pagos',1),
('banks.manage','payments','manage_banks','Gestionar Bancos','Gestionar bancos',1),

('documents.view','documents','view','Ver Documentos','Ver documentos',0),
('documents.create','documents','create','Crear Documentos','Crear documentos',0),
('documents.sign','documents','sign','Firmar Documentos','Firmar documentos',1),
('documents.approve','documents','approve','Aprobar Documentos','Aprobar documentos',1),
('documents.sensitive.view','documents','view_sensitive','Ver documentos sensibles','Ver documentos sensibles',1),

('competencies.view','competencies','view','Ver Competencias','Ver competencias',0),
('competencies.manage','competencies','manage','Gestionar Competencias','Gestionar competencias',0),
('evaluations.create','competencies','create_evaluation','Crear Evaluaciones','Crear evaluaciones',0),
('evaluations.approve','competencies','approve_evaluation','Aprobar Evaluaciones','Aprobar evaluaciones',1),

('compliance.view','compliance','view','Ver Cumplimiento','Ver cumplimiento legal',0),
('compliance.export','compliance','export','Exportar Cumplimiento','Exportar cumplimiento',1),
('mtess.export','compliance','mtess_export','Exportar MTESS','Exportar MTESS',1),
('ips.export','compliance','ips_export','Exportar IPS','Exportar IPS',1),

('settings.view','settings','view','Ver Configuración','Ver configuración',0),
('settings.update','settings','update','Editar Configuración','Editar configuración',1),
('notifications.manage','settings','notifications','Gestionar Notificaciones','Gestionar notificaciones',1),
('integrations.manage','settings','integrations','Gestionar Integraciones','Gestionar integraciones',1),

('security.view','security','view','Ver Seguridad','Ver seguridad',1),
('security.users.manage','security','users','Gestionar Usuarios','Gestionar usuarios',1),
('security.roles.manage','security','roles','Gestionar Roles','Gestionar roles',1),
('security.permissions.manage','security','permissions','Gestionar Permisos','Gestionar permisos',1),
('security.scopes.manage','security','scopes','Gestionar Alcances','Gestionar alcances',1),

('audit.view','audit','view','Ver Auditoría','Ver auditoría',1),
('reports.view','reports','view','Ver Reportes','Ver reportes',0),
('reports.export','reports','export','Exportar Reportes','Exportar reportes',1)
ON DUPLICATE KEY UPDATE
  module_code = VALUES(module_code),
  action = VALUES(action),
  name = VALUES(name),
  description = VALUES(description),
  is_sensitive = VALUES(is_sensitive);

-- 9) super_admin con todos los permisos
INSERT IGNORE INTO role_permissions (role_id, permission_id, allowed)
SELECT r.id, p.id, 1
FROM roles r
JOIN permissions_catalog p
WHERE r.code = 'super_admin';

-- 10) Convertir admin actual
UPDATE users
SET role = 'super_admin'
WHERE username = 'admin';

INSERT IGNORE INTO user_roles (user_id, role_id, company_id, branch_id)
SELECT u.id, r.id, NULL, NULL
FROM users u
JOIN roles r ON r.code = 'super_admin'
WHERE u.username = 'admin';

INSERT IGNORE INTO user_scopes (user_id, scope_type)
SELECT id, 'global'
FROM users
WHERE username = 'admin';

-- 11) Módulos portal
INSERT INTO module_catalog (code, name, description, icon, route, status, required_permission, sort_order, is_active)
VALUES
('people','Gestión de Personas','Empleados, contratos, cargos y legajos.','users','/personas','available','people.view',10,1),
('attendance','Asistencia y Relojes','Marcaciones, horarios, ZKTeco y tiempo real.','clock','/asistencia','available','attendance.view',20,1),
('payroll','Nómina y Liquidaciones','Liquidaciones, IPS, aguinaldo y conceptos salariales.','calculator','/nomina','available','payroll.view',30,1),
('payments','Pagos y Bancos','Bancos, lotes de pago y archivos bancarios.','banknote','/pagos','available','payments.view',40,1),
('documents','Documentos','Plantillas, expedientes y firma electrónica.','file-text','/documentos','available','documents.view',50,1),
('competencies','Competencias','Evaluaciones, brechas y planes de desarrollo.','target','/competencias','available','competencies.view',60,1),
('compliance','Cumplimiento Legal','MTESS, IPS, planillas y vencimientos.','shield-check','/cumplimiento','available','compliance.view',70,1),
('reports','Reportes y Analítica','Indicadores, reportes y exportaciones.','bar-chart','/reportes','available','reports.view',80,1),
('settings','Configuración','Empresa, branding, integraciones y notificaciones.','settings','/configuracion','available','settings.view',90,1),
('security','Seguridad y Permisos','Usuarios, roles, permisos y alcances.','lock','/seguridad','available','security.view',100,1),
('audit','Auditoría','Eventos, trazabilidad y seguridad.','search','/auditoria','available','audit.view',110,1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  icon = VALUES(icon),
  route = VALUES(route),
  status = VALUES(status),
  required_permission = VALUES(required_permission),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

DROP PROCEDURE IF EXISTS add_col_if_missing;
