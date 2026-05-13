-- Notification event catalog: defines every possible event, its module, category,
-- default channels, and human-readable metadata. Powers the admin matrix UI.

CREATE TABLE IF NOT EXISTS notification_event_catalog (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_code   VARCHAR(100) NOT NULL UNIQUE,
  module_code  VARCHAR(100) NOT NULL,
  category     VARCHAR(50)  NOT NULL COMMENT 'RRHH|ASISTENCIA|NOMINA|VACACIONES|PERMISOS|DOCUMENTOS|COMPETENCIAS|CUMPLIMIENTO|SISTEMA',
  name         VARCHAR(150) NOT NULL,
  description  TEXT NULL,
  default_channels JSON NOT NULL DEFAULT ('["INTERNAL"]'),
  severity     VARCHAR(20)  NOT NULL DEFAULT 'info' COMMENT 'info|warning|critical',
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── RRHH Core ───────────────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('EMPLOYEE_CREATED',            'rrhh',        'RRHH',         'Alta de colaborador',                   'Nuevo colaborador registrado en el sistema',                          '["INTERNAL","EMAIL"]',          'info'),
('EMPLOYEE_UPDATED',            'rrhh',        'RRHH',         'Datos de colaborador actualizados',      'Se modificaron datos personales o laborales',                         '["INTERNAL"]',                  'info'),
('EMPLOYEE_STATUS_CHANGED',     'rrhh',        'RRHH',         'Cambio de estado laboral',               'Baja, suspensión o reactivación de empleado',                         '["INTERNAL","EMAIL"]',          'warning'),
('CONTRACT_EXPIRING',           'rrhh',        'RRHH',         'Contrato próximo a vencer',              'El contrato del colaborador vence en los próximos 30 días',            '["INTERNAL","EMAIL"]',          'warning'),
('PROBATION_EXPIRING',          'rrhh',        'RRHH',         'Vencimiento de período de prueba',       'El período de prueba termina en los próximos 7 días',                  '["INTERNAL"]',                  'warning'),
('BIRTHDAY',                    'rrhh',        'RRHH',         'Cumpleaños de colaborador',              'Hoy es el cumpleaños de un colaborador',                              '["INTERNAL"]',                  'info'),
('WORK_ANNIVERSARY',            'rrhh',        'RRHH',         'Aniversario laboral',                   'Aniversario de ingreso de un colaborador',                            '["INTERNAL"]',                  'info'),
('MISSING_DOCUMENTS',           'rrhh',        'RRHH',         'Documentos obligatorios faltantes',     'El colaborador no tiene todos los documentos requeridos cargados',     '["INTERNAL","EMAIL"]',          'warning'),
('EMPLOYEE_TERMINATED',         'rrhh',        'RRHH',         'Egreso de colaborador',                 'Se registró la baja definitiva de un colaborador',                    '["INTERNAL","EMAIL"]',          'info');

-- ─── Asistencia ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('MISSING_PUNCH',               'attendance',  'ASISTENCIA',   'Marcación faltante',                    'El colaborador no tiene marcación de entrada o salida',               '["INTERNAL"]',                  'warning'),
('LATE_ARRIVAL',                'attendance',  'ASISTENCIA',   'Llegada tardía',                        'El colaborador llegó fuera del margen permitido',                     '["INTERNAL"]',                  'info'),
('EARLY_DEPARTURE',             'attendance',  'ASISTENCIA',   'Salida anticipada',                     'El colaborador se retiró antes del horario de salida',                '["INTERNAL"]',                  'info'),
('UNJUSTIFIED_ABSENCE',         'attendance',  'ASISTENCIA',   'Ausencia injustificada',                'El colaborador no asistió y no hay permiso registrado',               '["INTERNAL","EMAIL"]',          'warning'),
('OVERTIME_PENDING_APPROVAL',   'attendance',  'ASISTENCIA',   'Horas extra pendientes de aprobación',  'Se detectaron horas extraordinarias que requieren aprobación',        '["INTERNAL"]',                  'info'),
('SCHEDULE_CHANGED',            'attendance',  'ASISTENCIA',   'Cambio de horario o turno',             'El horario asignado al colaborador fue modificado',                   '["INTERNAL","EMAIL"]',          'info'),
('DEVICE_OFFLINE',              'attendance',  'ASISTENCIA',   'Reloj ZKTeco desconectado',             'Un dispositivo biométrico perdió conexión con el sistema',            '["INTERNAL"]',                  'critical');

-- ─── Permisos ────────────────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('LEAVE_REQUEST_CREATED',       'leaves',      'PERMISOS',     'Solicitud de permiso enviada',          'Un colaborador envió una solicitud de permiso',                       '["INTERNAL","EMAIL"]',          'info'),
('LEAVE_REQUEST_APPROVED',      'leaves',      'PERMISOS',     'Permiso aprobado',                      'La solicitud de permiso fue aprobada',                                '["INTERNAL","EMAIL"]',          'info'),
('LEAVE_REQUEST_REJECTED',      'leaves',      'PERMISOS',     'Permiso rechazado',                     'La solicitud de permiso fue rechazada',                               '["INTERNAL","EMAIL"]',          'warning'),
('LEAVE_PENDING_APPROVAL',      'leaves',      'PERMISOS',     'Permiso pendiente de aprobación',       'Hay solicitudes de permiso esperando revisión del jefe',              '["INTERNAL"]',                  'info');

-- ─── Vacaciones ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('VACATION_REQUEST_CREATED',    'vacations',   'VACACIONES',   'Solicitud de vacaciones enviada',       'Un colaborador envió solicitud de vacaciones',                        '["INTERNAL","EMAIL"]',          'info'),
('VACATION_REQUEST_APPROVED',   'vacations',   'VACACIONES',   'Vacaciones aprobadas',                  'La solicitud de vacaciones fue aprobada',                             '["INTERNAL","EMAIL"]',          'info'),
('VACATION_REQUEST_REJECTED',   'vacations',   'VACACIONES',   'Vacaciones rechazadas',                 'La solicitud de vacaciones fue rechazada',                            '["INTERNAL","EMAIL"]',          'warning'),
('VACATION_STARTING_SOON',      'vacations',   'VACACIONES',   'Vacaciones próximas a iniciar',         'El período de vacaciones comienza en los próximos 3 días',            '["INTERNAL","EMAIL"]',          'info'),
('VACATION_RETURN',             'vacations',   'VACACIONES',   'Retorno de vacaciones',                 'El colaborador debe reintegrarse hoy de sus vacaciones',              '["INTERNAL","EMAIL"]',          'info'),
('VACATION_BALANCE_CRITICAL',   'vacations',   'VACACIONES',   'Saldo de vacaciones crítico',           'El colaborador tiene días de vacaciones próximos a vencer',           '["INTERNAL"]',                  'warning');

-- ─── Nómina ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('PAYROLL_RUN_GENERATED',       'payroll',     'NOMINA',       'Liquidación generada',                  'Se generó la liquidación del período para revisión',                  '["INTERNAL","EMAIL"]',          'info'),
('PAYROLL_RUN_PENDING_APPROVAL','payroll',     'NOMINA',       'Liquidación pendiente de aprobación',   'La liquidación requiere aprobación de Gerencia/Finanzas',             '["INTERNAL","EMAIL"]',          'info'),
('PAYROLL_RUN_APPROVED',        'payroll',     'NOMINA',       'Liquidación aprobada',                  'La liquidación del período fue aprobada',                             '["INTERNAL","EMAIL"]',          'info'),
('PAYSLIP_AVAILABLE',           'payroll',     'NOMINA',       'Recibo de salario disponible',          'El recibo de salario del período está disponible para firma',         '["INTERNAL","EMAIL"]',          'info'),
('PAYMENT_PROCESSED',           'payroll',     'NOMINA',       'Pago de salario procesado',             'El lote de pago bancario fue procesado exitosamente',                 '["INTERNAL","EMAIL"]',          'info'),
('PAYMENT_REJECTED',            'payroll',     'NOMINA',       'Pago rechazado por banco',              'El banco rechazó uno o más pagos del lote',                           '["INTERNAL","EMAIL"]',          'critical'),
('PAYMENT_DIFFERENCE_DETECTED', 'payroll',     'NOMINA',       'Diferencia detectada en pago',          'El neto pagado difiere del neto liquidado',                           '["INTERNAL"]',                  'critical'),
('CHRISTMAS_BONUS_GENERATED',   'payroll',     'NOMINA',       'Aguinaldo generado',                    'Se calculó el aguinaldo del año',                                     '["INTERNAL","EMAIL"]',          'info'),
('SALARY_ADVANCE_APPROVED',     'payroll',     'NOMINA',       'Anticipo de salario aprobado',          'La solicitud de anticipo fue aprobada',                               '["INTERNAL","EMAIL"]',          'info');

-- ─── Gestión Documental ──────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('DOCUMENT_SENT',               'documents',   'DOCUMENTOS',   'Documento enviado para firma',          'Se asignó un documento al colaborador para su revisión y firma',      '["INTERNAL","EMAIL"]',          'info'),
('DOCUMENT_VIEWED',             'documents',   'DOCUMENTOS',   'Documento visualizado',                 'El destinatario abrió el documento',                                  '["INTERNAL"]',                  'info'),
('DOCUMENT_COMMENTED',          'documents',   'DOCUMENTOS',   'Comentario en documento',               'Se agregó un comentario al documento',                                '["INTERNAL"]',                  'info'),
('DOCUMENT_SIGNED',             'documents',   'DOCUMENTOS',   'Documento firmado',                     'El colaborador firmó el documento exitosamente',                      '["INTERNAL","EMAIL"]',          'info'),
('DOCUMENT_EXPIRED',            'documents',   'DOCUMENTOS',   'Documento vencido',                     'Un documento no fue firmado dentro del plazo',                        '["INTERNAL","EMAIL"]',          'warning'),
('DOCUMENT_REJECTED',           'documents',   'DOCUMENTOS',   'Documento rechazado',                   'El colaborador rechazó o solicitó corrección del documento',          '["INTERNAL","EMAIL"]',          'warning'),
('DOCUMENT_PENDING_SIGNATURE',  'documents',   'DOCUMENTOS',   'Documento pendiente de firma',          'Recordatorio: hay documentos sin firmar',                             '["INTERNAL"]',                  'warning');

-- ─── Competencias y Desempeño ────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('EVALUATION_CYCLE_STARTED',    'competencies','COMPETENCIAS', 'Ciclo de evaluación iniciado',          'Se abrió un nuevo ciclo de evaluación por competencias',              '["INTERNAL","EMAIL"]',          'info'),
('SELF_EVALUATION_PENDING',     'competencies','COMPETENCIAS', 'Autoevaluación pendiente',              'El colaborador tiene una autoevaluación pendiente',                   '["INTERNAL","EMAIL"]',          'warning'),
('MANAGER_EVALUATION_PENDING',  'competencies','COMPETENCIAS', 'Evaluación de jefe pendiente',          'Hay colaboradores esperando evaluación del jefe',                     '["INTERNAL","EMAIL"]',          'warning'),
('CRITICAL_GAP_DETECTED',       'competencies','COMPETENCIAS', 'Brecha crítica de competencia detectada','Se identificó una brecha crítica en el perfil del colaborador',     '["INTERNAL","EMAIL"]',          'critical'),
('DEVELOPMENT_PLAN_ASSIGNED',   'competencies','COMPETENCIAS', 'Plan de desarrollo asignado',           'Se asignó un plan de desarrollo al colaborador',                      '["INTERNAL","EMAIL"]',          'info'),
('TRAINING_DUE_SOON',           'competencies','COMPETENCIAS', 'Capacitación próxima a vencer',         'Una capacitación del plan de desarrollo vence pronto',                '["INTERNAL"]',                  'warning');

-- ─── Cumplimiento Legal ──────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('MTESS_COMMUNICATION_DUE',     'compliance',  'CUMPLIMIENTO', 'Comunicación MTESS/REOP pendiente',     'Hay una comunicación MTESS que debe presentarse antes del vencimiento','["INTERNAL","EMAIL"]',          'critical'),
('IPS_REPORT_DUE',              'compliance',  'CUMPLIMIENTO', 'Reporte IPS/REI pendiente',             'El reporte de aportes IPS debe presentarse',                          '["INTERNAL","EMAIL"]',          'critical'),
('LABOR_PLANILLA_DUE',          'compliance',  'CUMPLIMIENTO', 'Planilla laboral con vencimiento próximo','La planilla laboral anual vence pronto',                            '["INTERNAL","EMAIL"]',          'critical'),
('COMPLIANCE_FILE_ERROR',       'compliance',  'CUMPLIMIENTO', 'Error en archivo regulatorio',          'El archivo generado para MTESS/IPS contiene errores de validación',   '["INTERNAL","EMAIL"]',          'critical'),
('COMPLIANCE_SUBMITTED',        'compliance',  'CUMPLIMIENTO', 'Comunicación regulatoria enviada',      'Se presentó exitosamente una comunicación ante el organismo',         '["INTERNAL"]',                  'info'),
('COMPLIANCE_REJECTED',         'compliance',  'CUMPLIMIENTO', 'Comunicación regulatoria rechazada',    'Un organismo rechazó la comunicación presentada',                     '["INTERNAL","EMAIL"]',          'critical');

-- ─── Sistema ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO notification_event_catalog (event_code, module_code, category, name, description, default_channels, severity) VALUES
('BACKUP_COMPLETED',            'system',      'SISTEMA',      'Backup completado',                     'El backup automático del sistema se completó correctamente',          '["INTERNAL"]',                  'info'),
('BACKUP_FAILED',               'system',      'SISTEMA',      'Backup fallido',                        'El backup automático falló y requiere atención',                      '["INTERNAL","EMAIL"]',          'critical'),
('SECURITY_ALERT',              'system',      'SISTEMA',      'Alerta de seguridad',                   'Actividad sospechosa o acceso no autorizado detectado',               '["INTERNAL","EMAIL"]',          'critical'),
('USER_PASSWORD_CHANGED',       'system',      'SISTEMA',      'Contraseña de usuario cambiada',        'Se cambió la contraseña de una cuenta de usuario',                    '["INTERNAL","EMAIL"]',          'warning'),
('SYSTEM_UPDATE',               'system',      'SISTEMA',      'Actualización del sistema',             'El sistema fue actualizado a una nueva versión',                      '["INTERNAL"]',                  'info');

-- Keep existing notification_templates in sync with the catalog event codes
-- Existing templates seeded in migration 048 remain valid.
-- New templates can be added via the admin panel or future migrations.
