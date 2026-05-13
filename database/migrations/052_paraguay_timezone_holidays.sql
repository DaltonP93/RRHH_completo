-- 052_paraguay_timezone_holidays.sql
-- Corrige timezone a Paraguay (-03:00) y reemplaza feriados por los de Paraguay

-- Cambiar timezone default de la sesión/conexión
-- (la app backend usa TZ=America/Asuncion en PM2/ecosystem)

-- Reemplazar feriados México/Guatemala por feriados nacionales Paraguay
DELETE FROM holidays WHERE type IN ('national', 'institutional') AND YEAR(date) >= 2026;

INSERT INTO holidays (name, date, type) VALUES
  -- Feriados fijos Paraguay 2026
  ('Año Nuevo',                          '2026-01-01', 'national'),
  ('Día de los Héroes',                  '2026-03-01', 'national'),
  ('Jueves Santo',                       '2026-04-02', 'national'),
  ('Viernes Santo',                      '2026-04-03', 'national'),
  ('Día del Trabajador',                 '2026-05-01', 'national'),
  ('Día de la Independencia Nacional',   '2026-05-15', 'national'),
  ('Paz del Chaco',                      '2026-06-12', 'national'),
  ('Fundación de Asunción',              '2026-08-15', 'national'),
  ('Victoria de Boquerón',               '2026-09-29', 'national'),
  ('Día de la Raza',                     '2026-10-12', 'national'),
  ('Todos los Santos',                   '2026-11-01', 'national'),
  ('Virgen de Caacupé',                  '2026-12-08', 'national'),
  ('Navidad',                            '2026-12-25', 'national'),
  -- 2027
  ('Año Nuevo',                          '2027-01-01', 'national'),
  ('Día de los Héroes',                  '2027-03-01', 'national'),
  ('Jueves Santo',                       '2027-03-25', 'national'),
  ('Viernes Santo',                      '2027-03-26', 'national'),
  ('Día del Trabajador',                 '2027-05-01', 'national'),
  ('Día de la Independencia Nacional',   '2027-05-15', 'national'),
  ('Paz del Chaco',                      '2027-06-12', 'national'),
  ('Fundación de Asunción',              '2027-08-15', 'national'),
  ('Victoria de Boquerón',               '2027-09-29', 'national'),
  ('Día de la Raza',                     '2027-10-12', 'national'),
  ('Todos los Santos',                   '2027-11-01', 'national'),
  ('Virgen de Caacupé',                  '2027-12-08', 'national'),
  ('Navidad',                            '2027-12-25', 'national');

-- Crear tablas de calendarios de feriados configurables
CREATE TABLE IF NOT EXISTS holiday_calendars (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  country     VARCHAR(10) DEFAULT 'PY',
  year        INT NOT NULL,
  company_id  INT NULL,
  branch_id   INT NULL,
  is_default  TINYINT(1) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holiday_calendar_items (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  calendar_id  INT NOT NULL,
  name         VARCHAR(150) NOT NULL,
  date         DATE NOT NULL,
  type         ENUM('national','institutional','branch','optional') DEFAULT 'national',
  affects_attendance TINYINT(1) DEFAULT 1,
  affects_payroll    TINYINT(1) DEFAULT 1,
  notes        TEXT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_calendar_date (calendar_id, date),
  FOREIGN KEY (calendar_id) REFERENCES holiday_calendars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Setting para timezone
INSERT INTO settings (`key`, `value`, description, data_type, is_public) VALUES
  ('system.timezone',    'America/Asuncion', 'Zona horaria del sistema', 'string', 1),
  ('system.country',     'PY',               'País de operación',        'string', 1),
  ('system.currency',    'PYG',              'Moneda (guaraní)',          'string', 1),
  ('system.date_format', 'DD/MM/YYYY',       'Formato de fecha',         'string', 1)
ON DUPLICATE KEY UPDATE value = VALUES(value);
