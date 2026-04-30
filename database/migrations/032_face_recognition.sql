-- Migración 032: Reconocimiento facial
-- Agrega descriptor facial (vector 128-d de face-api.js) a empleados

ALTER TABLE employees
  ADD COLUMN face_photo_url  VARCHAR(500)   NULL AFTER photo_url,
  ADD COLUMN face_descriptor JSON           NULL COMMENT 'Vector 128-d face-api.js',
  ADD COLUMN face_enrolled_at DATETIME      NULL,
  ADD COLUMN face_enrolled_by INT           NULL;

-- Tabla de log de verificaciones faciales
CREATE TABLE IF NOT EXISTS face_verifications (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id   INT NOT NULL,
  attendance_log_id BIGINT NULL,
  distance      FLOAT NOT NULL COMMENT 'Distancia euclidiana (< 0.6 = match)',
  matched       TINYINT(1) NOT NULL DEFAULT 0,
  selfie_url    VARCHAR(500) NULL,
  ip            VARCHAR(45) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fv_employee (employee_id),
  INDEX idx_fv_log (attendance_log_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
