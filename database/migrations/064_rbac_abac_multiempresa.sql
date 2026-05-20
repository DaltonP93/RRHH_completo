-- ─── Migración 064: RBAC / ABAC multiempresa ─────────────────────────────────
-- Crea todas las tablas del sistema de roles, permisos, alcances y catálogo
-- de módulos. Siembra los módulos del portal y el catálogo de permisos.
-- Idempotente: CREATE TABLE IF NOT EXISTS, ON DUPLICATE KEY UPDATE.
-- Sin transacciones: DDL de MySQL hace auto-commit.

-- ─── roles ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(80) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  description TEXT NULL,
  level       INT NOT NULL DEFAULT 100,
  is_system   TINYINT(1) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── permissions_catalog ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions_catalog (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  code         VARCHAR(120) NOT NULL UNIQUE,
  module_code  VARCHAR(80) NOT NULL,
  action       VARCHAR(80) NOT NULL,
  name         VARCHAR(150) NOT NULL,
  description  TEXT NULL,
  is_sensitive TINYINT(1) DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── role_permissions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT NOT NULL,
  permission_id INT NOT NULL,
  allowed       TINYINT(1) DEFAULT 1,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id)       REFERENCES roles(id)               ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions_catalog(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── user_roles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    INT NOT NULL,
  role_id    INT NOT NULL,
  company_id INT NULL DEFAULT NULL,
  branch_id  INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id, company_id, branch_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── user_scopes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_scopes (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       INT NOT NULL,
  scope_type    ENUM('global','company','branch','department','team','own') NOT NULL,
  company_id    INT NULL,
  branch_id     INT NULL,
  department_id INT NULL,
  employee_id   INT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── field_permissions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_permissions (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id    INT NOT NULL,
  entity     VARCHAR(80) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  can_view   TINYINT(1) DEFAULT 0,
  can_update TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fp (role_id, entity, field_name),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── module_catalog ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_catalog (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  code                VARCHAR(80) NOT NULL UNIQUE,
  name                VARCHAR(150) NOT NULL,
  description         TEXT NULL,
  icon                VARCHAR(80) NULL,
  route               VARCHAR(255) NULL,
  parent_code         VARCHAR(80) NULL,
  sort_order          INT DEFAULT 0,
  status              ENUM('available','in_progress','pending_migration','requires_permissions','error','disabled') DEFAULT 'available',
  requires_permission VARCHAR(120) NULL,
  is_active           TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── module_menu_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_menu_items (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  module_code         VARCHAR(80) NOT NULL,
  label               VARCHAR(150) NOT NULL,
  route               VARCHAR(255) NOT NULL,
  icon                VARCHAR(80) NULL,
  sort_order          INT DEFAULT 0,
  requires_permission VARCHAR(120) NULL,
  is_active           TINYINT(1) DEFAULT 1,
  FOREIGN KEY (module_code) REFERENCES module_catalog(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Módulos del portal ───────────────────────────────────────────────────────
INSERT INTO module_catalog (code, name, description, icon, route, sort_order, status) VALUES
  ('personas',      'Personas',             'Gestión de empleados, cargos y departamentos',         'Users',          '/empleados',               1,  'available'),
  ('asistencia',    'Asistencia',           'Control de marcaciones, horarios y permisos',          'Clock',          '/asistencia',              2,  'available'),
  ('nomina',        'Nómina',               'Liquidaciones, conceptos salariales y aguinaldo',      'DollarSign',     '/nomina',                  3,  'in_progress'),
  ('pagos',         'Pagos',                'Gestión bancaria y exportación de lotes de pago',      'CreditCard',     '/bancos',                  4,  'in_progress'),
  ('documentos',    'Documentos',           'Firma digital y gestión documental',                   'FolderOpen',     '/documentos',              5,  'in_progress'),
  ('competencias',  'Competencias',         'Evaluación por competencias y planes de desarrollo',   'Star',           '/competencias',            6,  'pending_migration'),
  ('cumplimiento',  'Cumplimiento',         'Comunicaciones MTESS, IPS y planillas laborales',      'ShieldCheck',    '/cumplimiento',            7,  'pending_migration'),
  ('reportes',      'Reportes',             'Reportes de asistencia, nómina y exportaciones',       'BarChart2',      '/reportes',                8,  'available'),
  ('configuracion', 'Configuración',        'Configuración general del sistema y empresa',          'Settings',       '/configuracion',           9,  'available'),
  ('seguridad',     'Seguridad',            'Usuarios, roles, permisos y alcances',                 'Lock',           '/seguridad/roles',         10, 'requires_permissions'),
  ('auditoria',     'Auditoría',            'Registro de eventos y trazabilidad',                   'Activity',       '/auditoria',               11, 'available')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), icon=VALUES(icon), route=VALUES(route), sort_order=VALUES(sort_order), status=VALUES(status);

-- ─── Catálogo de permisos ─────────────────────────────────────────────────────
INSERT INTO permissions_catalog (code, module_code, action, name) VALUES
  -- personas
  ('people.view',                'personas',     'view',         'Ver empleados'),
  ('people.create',              'personas',     'create',       'Crear empleados'),
  ('people.update',              'personas',     'update',       'Editar empleados'),
  ('people.delete',              'personas',     'delete',       'Eliminar empleados'),
  ('people.export',              'personas',     'export',       'Exportar empleados'),
  ('people.import',              'personas',     'import',       'Importar empleados'),
  ('people.view_salary',         'personas',     'view_salary',  'Ver salario de empleados'),
  ('people.update_salary',       'personas',     'update_salary','Editar salario de empleados'),
  -- cargos
  ('positions.view',             'personas',     'view',         'Ver cargos'),
  ('positions.create',           'personas',     'create',       'Crear cargos'),
  ('positions.update',           'personas',     'update',       'Editar cargos'),
  ('positions.delete',           'personas',     'delete',       'Eliminar cargos'),
  -- departamentos
  ('departments.view',           'personas',     'view',         'Ver departamentos'),
  ('departments.create',         'personas',     'create',       'Crear departamentos'),
  ('departments.update',         'personas',     'update',       'Editar departamentos'),
  ('departments.delete',         'personas',     'delete',       'Eliminar departamentos'),
  -- asistencia
  ('attendance.view',            'asistencia',   'view',         'Ver asistencia'),
  ('attendance.create',          'asistencia',   'create',       'Registrar marcaciones'),
  ('attendance.update',          'asistencia',   'update',       'Editar marcaciones'),
  ('attendance.delete',          'asistencia',   'delete',       'Eliminar marcaciones'),
  ('attendance.export',          'asistencia',   'export',       'Exportar asistencia'),
  ('attendance.approve',         'asistencia',   'approve',      'Aprobar horas extra'),
  ('attendance.sync',            'asistencia',   'sync',         'Sincronizar att2000'),
  -- permisos/licencias
  ('leaves.view',                'asistencia',   'view',         'Ver permisos'),
  ('leaves.create',              'asistencia',   'create',       'Solicitar permisos'),
  ('leaves.update',              'asistencia',   'update',       'Editar permisos'),
  ('leaves.delete',              'asistencia',   'delete',       'Eliminar permisos'),
  ('leaves.approve',             'asistencia',   'approve',      'Aprobar permisos'),
  -- nómina
  ('payroll.view',               'nomina',       'view',         'Ver nómina'),
  ('payroll.create',             'nomina',       'create',       'Crear liquidaciones'),
  ('payroll.update',             'nomina',       'update',       'Editar liquidaciones'),
  ('payroll.delete',             'nomina',       'delete',       'Eliminar liquidaciones'),
  ('payroll.approve',            'nomina',       'approve',      'Aprobar liquidaciones'),
  ('payroll.export',             'nomina',       'export',       'Exportar nómina'),
  ('payroll.view_payslip',       'nomina',       'view_payslip', 'Ver recibo de salario propio'),
  -- pagos
  ('payments.view',              'pagos',        'view',         'Ver pagos'),
  ('payments.create',            'pagos',        'create',       'Crear lotes de pago'),
  ('payments.approve',           'pagos',        'approve',      'Aprobar lotes de pago'),
  ('payments.export',            'pagos',        'export',       'Exportar archivos bancarios'),
  -- documentos
  ('documents.view',             'documentos',   'view',         'Ver documentos'),
  ('documents.create',           'documentos',   'create',       'Crear/subir documentos'),
  ('documents.update',           'documentos',   'update',       'Editar documentos'),
  ('documents.delete',           'documentos',   'delete',       'Eliminar documentos'),
  ('documents.sign',             'documentos',   'sign',         'Firmar documentos'),
  ('documents.export',           'documentos',   'export',       'Exportar documentos'),
  -- competencias
  ('competencies.view',          'competencias', 'view',         'Ver competencias'),
  ('competencies.create',        'competencias', 'create',       'Crear evaluaciones'),
  ('competencies.update',        'competencias', 'update',       'Editar evaluaciones'),
  ('competencies.delete',        'competencias', 'delete',       'Eliminar evaluaciones'),
  ('competencies.export',        'competencias', 'export',       'Exportar evaluaciones'),
  -- cumplimiento
  ('compliance.view',            'cumplimiento', 'view',         'Ver cumplimiento'),
  ('compliance.create',          'cumplimiento', 'create',       'Crear comunicaciones'),
  ('compliance.update',          'cumplimiento', 'update',       'Editar comunicaciones'),
  ('compliance.delete',          'cumplimiento', 'delete',       'Eliminar comunicaciones'),
  ('compliance.submit',          'cumplimiento', 'submit',       'Presentar comunicaciones'),
  ('compliance.export',          'cumplimiento', 'export',       'Exportar archivos regulatorios'),
  -- reportes
  ('reports.view',               'reportes',     'view',         'Ver reportes'),
  ('reports.export',             'reportes',     'export',       'Exportar reportes'),
  -- configuración
  ('config.view',                'configuracion','view',         'Ver configuración'),
  ('config.update',              'configuracion','update',       'Editar configuración'),
  -- seguridad
  ('security.view',              'seguridad',    'view',         'Ver usuarios y roles'),
  ('security.manage_users',      'seguridad',    'manage_users', 'Gestionar usuarios'),
  ('security.manage_roles',      'seguridad',    'manage_roles', 'Gestionar roles'),
  ('security.manage_permissions','seguridad',    'manage_perms', 'Gestionar permisos'),
  ('security.manage_scopes',     'seguridad',    'manage_scopes','Gestionar alcances'),
  -- auditoría
  ('audit.view',                 'auditoria',    'view',         'Ver auditoría'),
  ('audit.export',               'auditoria',    'export',       'Exportar auditoría')
ON DUPLICATE KEY UPDATE name=VALUES(name), module_code=VALUES(module_code), action=VALUES(action);
