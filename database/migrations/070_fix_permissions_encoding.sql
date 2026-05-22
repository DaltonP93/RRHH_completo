USE asistencia;

UPDATE roles SET
  name = REPLACE(name, 'NÃ³mina', 'Nómina'),
  name = REPLACE(name, 'TesorerÃ­a', 'Tesorería'),
  description = REPLACE(description, 'nÃ³mina', 'nómina'),
  description = REPLACE(description, 'tÃ©cnico', 'técnico'),
  description = REPLACE(description, 'especÃ­fica', 'específica'),
  description = REPLACE(description, 'auditorÃ­a', 'auditoría');

UPDATE permissions_catalog SET
  name = REPLACE(name, 'marcaciÃ³n', 'marcación'),
  name = REPLACE(name, 'importaciÃ³n', 'importación'),
  name = REPLACE(name, 'AuditorÃ­a', 'Auditoría'),
  name = REPLACE(name, 'NÃ³mina', 'Nómina'),
  name = REPLACE(name, 'ConfiguraciÃ³n', 'Configuración'),
  description = REPLACE(description, 'marcaciÃ³n', 'marcación'),
  description = REPLACE(description, 'importaciÃ³n', 'importación'),
  description = REPLACE(description, 'auditorÃ­a', 'auditoría'),
  description = REPLACE(description, 'nÃ³mina', 'nómina'),
  description = REPLACE(description, 'mÃ³dulo', 'módulo'),
  description = REPLACE(description, 'configuraciÃ³n', 'configuración');
