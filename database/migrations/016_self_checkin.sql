-- Migración 016: Auto-marcación empleado (QR/geoloc)

DROP PROCEDURE IF EXISTS mig_016_add_col;
DELIMITER $
CREATE PROCEDURE mig_016_add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN defn TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @s = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN ', col, ' ', defn);
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$
DELIMITER ;

-- Columnas opcionales en attendance_logs para marcar origen web/QR
CALL mig_016_add_col('attendance_logs', 'source',    "VARCHAR(20) DEFAULT 'device'"); -- device|web|qr|geo|manual
CALL mig_016_add_col('attendance_logs', 'lat',       'DECIMAL(10,7) NULL');
CALL mig_016_add_col('attendance_logs', 'lng',       'DECIMAL(10,7) NULL');
CALL mig_016_add_col('attendance_logs', 'user_agent','VARCHAR(255) NULL');

-- Tabla de tokens QR por sede (rotatorio cada N min)
CREATE TABLE IF NOT EXISTS checkin_qr_tokens (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  branch_id   INT NOT NULL,
  token       VARCHAR(64) UNIQUE NOT NULL,
  expires_at  DATETIME NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_branch (branch_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bounding box por sede para validar geolocalización (opcional)
CALL mig_016_add_col('branches', 'geo_lat',     'DECIMAL(10,7) NULL');
CALL mig_016_add_col('branches', 'geo_lng',     'DECIMAL(10,7) NULL');
CALL mig_016_add_col('branches', 'geo_radius_m','INT DEFAULT 200');

DROP PROCEDURE mig_016_add_col;
