-- 078_fix_documents_runtime_schema.sql
-- Crea tablas de documentos digitales de forma idempotente.
-- Re-ejecutable sin errores en MySQL 8.

USE asistencia;

CREATE TABLE IF NOT EXISTS document_folders (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  parent_id   INT UNSIGNED NULL,
  description TEXT NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS documents (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(500) NOT NULL,
  module        VARCHAR(100) NULL,
  status        ENUM('draft','pending','sent','viewed','signed','cancelled') NOT NULL DEFAULT 'draft',
  employee_id   INT UNSIGNED NULL,
  template_id   INT UNSIGNED NULL,
  folder_id     INT UNSIGNED NULL,
  rendered_html LONGTEXT NULL,
  hash          VARCHAR(64) NULL,
  version       INT NOT NULL DEFAULT 1,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_documents_employee  (employee_id),
  INDEX idx_documents_template  (template_id),
  INDEX idx_documents_status    (status),
  INDEX idx_documents_module    (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_versions (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id    INT UNSIGNED NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  rendered_html  LONGTEXT NULL,
  hash           VARCHAR(64) NULL,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dv_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_recipients (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NULL,
  role        VARCHAR(50) NOT NULL DEFAULT 'signer',
  status      ENUM('pending','viewed','signed','rejected') NOT NULL DEFAULT 'pending',
  sent_at     DATETIME NULL,
  viewed_at   DATETIME NULL,
  signed_at   DATETIME NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dr_document  (document_id),
  INDEX idx_dr_employee  (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_signatures (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id  INT UNSIGNED NOT NULL,
  recipient_id INT UNSIGNED NULL,
  signer_id    INT UNSIGNED NULL,
  signature_type ENUM('electronic','digital','biometric') NOT NULL DEFAULT 'electronic',
  hash         VARCHAR(64) NULL,
  signer_ip    VARCHAR(45) NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ds_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_comments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  author_id   INT UNSIGNED NULL,
  content     TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dc_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_audit_logs (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id  INT UNSIGNED NOT NULL,
  action       VARCHAR(100) NOT NULL,
  performed_by INT UNSIGNED NULL,
  signer_ip    VARCHAR(45) NULL,
  meta_json    JSON NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dal_document (document_id),
  INDEX idx_dal_action   (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Columnas adicionales de document_folders por si la tabla ya existía sin ellas
DELIMITER $$
DROP PROCEDURE IF EXISTS add_col_if_missing $$
CREATE PROCEDURE add_col_if_missing(
  IN p_table      VARCHAR(64),
  IN p_column     VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE _stmt FROM @_sql;
    EXECUTE _stmt;
    DEALLOCATE PREPARE _stmt;
  END IF;
END $$
DELIMITER ;

CALL add_col_if_missing('daily_summary', 'justification',      'TEXT NULL');
CALL add_col_if_missing('daily_summary', 'justification_type', "VARCHAR(50) NULL DEFAULT 'other'");

DROP PROCEDURE IF EXISTS add_col_if_missing;
