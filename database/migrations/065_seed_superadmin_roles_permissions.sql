-- ─── Migración 065: Seed super_admin — roles, permisos y menú ────────────────
-- Siembra roles base, asigna super_admin al usuario 'admin',
-- establece scope global y asigna todos los permisos al rol super_admin.
-- Idempotente: ON DUPLICATE KEY UPDATE, INSERT IGNORE.
-- Sin transacciones: DDL de MySQL hace auto-commit.

-- ─── Roles base ──────────────────────────────────────────────────────────────
INSERT INTO roles (code, name, description, level, is_system) VALUES
  ('super_admin',        'Super Administrador',        'Acceso global total',                              1,   1),
  ('platform_admin',     'Administrador de Plataforma','Administra la plataforma',                         2,   1),
  ('company_admin',      'Administrador de Empresa',   'Administra empresa específica',                    10,  1),
  ('hr_admin',           'Administrador RRHH',         'Administra RRHH en su alcance',                    20,  1),
  ('hr_operator',        'Operador RRHH',              'Operaciones básicas RRHH',                         25,  1),
  ('payroll_admin',      'Administrador Nómina',       'Administra nómina y liquidaciones',                30,  1),
  ('payroll_operator',   'Operador Nómina',            'Operaciones básicas nómina',                       35,  1),
  ('treasury_admin',     'Administrador Tesorería',    'Administra pagos y bancos',                        40,  1),
  ('compliance_admin',   'Administrador Cumplimiento', 'Administra cumplimiento legal',                    45,  1),
  ('document_admin',     'Administrador Documentos',   'Administra documentos',                            50,  1),
  ('competency_admin',   'Administrador Competencias', 'Administra competencias',                          55,  1),
  ('supervisor',         'Supervisor',                 'Gestiona su equipo',                               60,  1),
  ('employee',           'Empleado',                   'Acceso autoservicio',                              100, 1),
  ('auditor',            'Auditor',                    'Consulta y auditoría sin edición',                 90,  1),
  ('readonly',           'Solo lectura',               'Acceso de lectura solamente',                      95,  1)
ON DUPLICATE KEY UPDATE name=VALUES(name), level=VALUES(level);

-- ─── Actualizar usuario admin a super_admin ───────────────────────────────────
UPDATE users SET role='super_admin' WHERE username='admin';

-- ─── Asignar rol super_admin al usuario admin en user_roles ──────────────────
INSERT IGNORE INTO user_roles (user_id, role_id, company_id, branch_id)
SELECT u.id, r.id, NULL, NULL
FROM users u
JOIN roles r ON r.code = 'super_admin'
WHERE u.username = 'admin';

-- ─── Scope global para super_admin ───────────────────────────────────────────
INSERT IGNORE INTO user_scopes (user_id, scope_type)
SELECT id, 'global' FROM users WHERE username = 'admin';

-- ─── Asignar todos los permisos al rol super_admin ───────────────────────────
INSERT IGNORE INTO role_permissions (role_id, permission_id, allowed)
SELECT r.id, pc.id, 1
FROM roles r, permissions_catalog pc
WHERE r.code = 'super_admin';

-- ─── Menu items por módulo ────────────────────────────────────────────────────
INSERT IGNORE INTO module_menu_items (module_code, label, route, icon, sort_order) VALUES
  -- personas
  ('personas',    'Dashboard Personas',        '/empleados',                'LayoutDashboard', 1),
  ('personas',    'Empleados',                 '/empleados',                'Users',           2),
  ('personas',    'Cargos',                    '/cargos',                   'Briefcase',       3),
  ('personas',    'Departamentos',             '/departamentos',            'Building2',       4),
  ('personas',    'Sucursales',                '/configuracion/sedes',      'MapPin',          5),
  -- asistencia
  ('asistencia',  'Dashboard Asistencia',      '/asistencia',               'LayoutDashboard', 1),
  ('asistencia',  'Marcaciones',               '/asistencia',               'Clock',           2),
  ('asistencia',  'Tiempo Real',               '/asistencia/tiempo-real',   'Radio',           3),
  ('asistencia',  'Importación att2000',        '/sync/att2000',             'Database',        4),
  ('asistencia',  'Horarios',                  '/configuracion/turnos',     'Calendar',        5),
  ('asistencia',  'Permisos',                  '/permisos',                 'Calendar',        6),
  ('asistencia',  'Aprobaciones',              '/aprobaciones',             'CheckSquare',     7),
  ('asistencia',  'Banco de Horas',            '/banco-horas',              'PiggyBank',       8),
  -- nomina
  ('nomina',      'Dashboard Nómina',          '/nomina',                   'LayoutDashboard', 1),
  ('nomina',      'Liquidaciones',             '/nomina/liquidaciones',     'DollarSign',      2),
  ('nomina',      'Conceptos Salariales',      '/nomina/conceptos',         'Layers',          3),
  ('nomina',      'Aguinaldo',                 '/nomina/aguinaldo',         'Cake',            4),
  ('nomina',      'Vacaciones Pagadas',        '/vacaciones',               'Plane',           5),
  ('nomina',      'Anticipos',                 '/nomina/anticipos',         'PiggyBank',       6),
  -- pagos
  ('pagos',       'Dashboard Pagos',           '/bancos',                   'LayoutDashboard', 1),
  ('pagos',       'Bancos',                    '/bancos',                   'CreditCard',      2),
  -- documentos
  ('documentos',  'Documentos',                '/documentos',               'FolderOpen',      1),
  ('documentos',  'Plantillas',                '/documentos',               'FileText',        2),
  -- seguridad
  ('seguridad',   'Usuarios',                  '/usuarios',                 'Users',           1),
  ('seguridad',   'Roles',                     '/seguridad/roles',          'Shield',          2),
  ('seguridad',   'Permisos',                  '/seguridad/permisos',       'Lock',            3),
  ('seguridad',   'Alcances',                  '/seguridad/alcances',       'Globe',           4),
  -- auditoria
  ('auditoria',   'Auditoría',                 '/auditoria',                'Activity',        1);
