USE asistencia;

UPDATE roles SET
  name = 'Administrador Nómina',
  description = 'Administra nómina y liquidaciones'
WHERE code = 'payroll_admin';

UPDATE roles SET
  name = 'Operador Nómina',
  description = 'Operador de nómina'
WHERE code = 'payroll_operator';

UPDATE roles SET
  name = 'Administrador Tesorería'
WHERE code = 'treasury_admin';

UPDATE roles SET
  description = 'Administrador técnico de plataforma'
WHERE code = 'platform_admin';

UPDATE roles SET
  description = 'Administra una empresa específica'
WHERE code = 'company_admin';

UPDATE roles SET
  description = 'Consulta y auditoría'
WHERE code = 'auditor';
