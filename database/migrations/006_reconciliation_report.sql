-- Migration 006: tabla de reporte de reconciliación att2000 vs MySQL
-- El job nocturno (api/src/services/reconciliation.js) escribe aquí.

CREATE TABLE IF NOT EXISTS reconciliation_report (
  id                 INT PRIMARY KEY AUTO_INCREMENT,
  report_date        DATE NOT NULL,
  mysql_count        INT NOT NULL DEFAULT 0,
  att2000_count      INT NOT NULL DEFAULT 0,
  missing_in_mysql   INT NOT NULL DEFAULT 0,
  missing_in_att2000 INT NOT NULL DEFAULT 0,
  samples_json       JSON NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
