-- -------------------------------------------------------------
-- 007_external_hr_sources.sql
-- Configuración de fuentes externas de datos de empleados
-- (ERP/HR API: SAP, Bejerman, Meta4, Workday, Odoo, CSV remoto, etc.)
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS external_hr_sources (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  name            VARCHAR(100) NOT NULL,
  type            ENUM('http_json','http_csv','webhook') NOT NULL DEFAULT 'http_json',

  -- Configuración HTTP
  url             VARCHAR(500) NOT NULL,
  method          ENUM('GET','POST') NOT NULL DEFAULT 'GET',
  headers_json    JSON,                           -- {"Authorization":"Bearer xxx","X-API-Key":"..."}
  body_json       JSON,                           -- Body para POST
  auth_type       ENUM('none','bearer','basic','api_key') DEFAULT 'none',
  auth_token      VARCHAR(500),                   -- Token/password encriptado (simple)

  -- Parseo / Mapeo
  json_root_path  VARCHAR(100) DEFAULT '',         -- ej: "data.employees" para extraer array anidado
  field_mapping   JSON NOT NULL,                   -- {"code":"userId","first_name":"givenName","last_name":"familyName",...}

  -- Scheduler
  schedule_cron   VARCHAR(50),                     -- ej: "0 4 * * *" → todos los días 04:00; null = manual
  enabled         TINYINT(1) DEFAULT 1,

  -- Estado de últimas ejecuciones
  last_run_at     DATETIME NULL,
  last_status     ENUM('success','error','running') NULL,
  last_result     JSON,                            -- {"created":10,"updated":5,"errors":[...]}

  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
