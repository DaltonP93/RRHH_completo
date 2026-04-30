-- Migración 030: plantillas de email customizables por tipo de evento
-- Permite a RRHH editar el HTML/asunto que se envía con cada notificación

CREATE TABLE IF NOT EXISTS email_templates (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  code          VARCHAR(60) UNIQUE NOT NULL,                  -- 'permission.approved', 'late.alert', 'report.daily', etc.
  name          VARCHAR(150) NOT NULL,
  description   VARCHAR(500) NULL,
  subject       VARCHAR(255) NOT NULL,
  body_html     LONGTEXT NOT NULL,                            -- HTML con variables {{nombre}}, {{fecha}}, etc.
  variables     JSON NULL,                                     -- ["nombre","fecha","hora"]
  active        TINYINT(1) NOT NULL DEFAULT 1,
  updated_by    INT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Plantillas iniciales (idempotente)
INSERT IGNORE INTO email_templates (code, name, description, subject, body_html, variables) VALUES
('permission.approved',
 'Permiso aprobado',
 'Notifica al empleado que su solicitud de permiso fue aprobada',
 'Permiso aprobado: {{tipo}} del {{desde}} al {{hasta}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#16a34a">✅ Permiso aprobado</h2><p>Hola <strong>{{nombre}}</strong>,</p><p>Tu solicitud de <strong>{{tipo}}</strong> del <strong>{{desde}}</strong> al <strong>{{hasta}}</strong> fue aprobada por <strong>{{aprobador}}</strong>.</p><p style="color:#64748b;font-size:13px">Sistema de Asistencia · {{fecha}}</p></div>',
 JSON_ARRAY('nombre','tipo','desde','hasta','aprobador','fecha')
),
('permission.rejected',
 'Permiso rechazado',
 'Notifica al empleado que su solicitud de permiso fue rechazada',
 'Permiso rechazado: {{tipo}} del {{desde}} al {{hasta}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#dc2626">❌ Permiso rechazado</h2><p>Hola <strong>{{nombre}}</strong>,</p><p>Tu solicitud de <strong>{{tipo}}</strong> del <strong>{{desde}}</strong> al <strong>{{hasta}}</strong> fue rechazada.</p><p><strong>Motivo:</strong> {{motivo}}</p><p style="color:#64748b;font-size:13px">Sistema de Asistencia · {{fecha}}</p></div>',
 JSON_ARRAY('nombre','tipo','desde','hasta','motivo','fecha')
),
('late.alert',
 'Alerta de atrasos diarios',
 'Resumen diario enviado a managers/RRHH con empleados que llegaron tarde',
 'Atrasos del día {{fecha}} ({{cantidad}} empleados)',
 '<div style="font-family:sans-serif;max-width:700px;margin:0 auto"><h2 style="color:#f59e0b">⚠️ Atrasos del día</h2><p>{{cantidad}} empleados llegaron tarde el {{fecha}}.</p>{{tabla}}<p style="color:#64748b;font-size:13px">Sistema de Asistencia</p></div>',
 JSON_ARRAY('fecha','cantidad','tabla')
),
('absence.alert',
 'Alerta de ausencias diarias',
 'Resumen de empleados ausentes del día',
 'Ausencias del día {{fecha}} ({{cantidad}} empleados)',
 '<div style="font-family:sans-serif;max-width:700px;margin:0 auto"><h2 style="color:#dc2626">🚨 Ausencias del día</h2><p>{{cantidad}} empleados sin marcaje el {{fecha}}.</p>{{tabla}}<p style="color:#64748b;font-size:13px">Sistema de Asistencia</p></div>',
 JSON_ARRAY('fecha','cantidad','tabla')
),
('report.scheduled',
 'Reporte programado',
 'Email contenedor para reportes automáticos (marcadas, mensual, etc.)',
 '{{titulo}} — {{periodo}}',
 '<div style="font-family:sans-serif;max-width:800px;margin:0 auto"><h1 style="color:#1e40af">{{titulo}}</h1><p>Período: <strong>{{periodo}}</strong></p>{{contenido}}<p style="color:#64748b;font-size:13px">Sistema de Asistencia · Generado el {{fecha}}</p></div>',
 JSON_ARRAY('titulo','periodo','contenido','fecha')
),
('password.reset',
 'Recuperación de contraseña',
 'Enlace para restablecer contraseña enviado al solicitante',
 'Recuperar contraseña — Sistema de Asistencia',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>🔐 Recuperar contraseña</h2><p>Hola <strong>{{nombre}}</strong>,</p><p>Hacé click en el siguiente enlace para restablecer tu contraseña. El enlace expira en {{expira_min}} minutos.</p><p><a href="{{link}}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">Restablecer contraseña</a></p><p style="color:#64748b;font-size:13px">Si no solicitaste esto, ignorá este email.</p></div>',
 JSON_ARRAY('nombre','link','expira_min')
);
