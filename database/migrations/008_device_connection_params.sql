-- -------------------------------------------------------------
-- 008_device_connection_params.sql
-- Parámetros de conexión específicos por reloj ZKTeco.
--
-- Motivación: modelos antiguos (GT200, etc) usan UDP exclusivamente,
-- mientras que los modernos (ZMM100_TFT, ZMM200_TFT) usan TCP. Además
-- algunos tienen contraseña de comunicación (comm_key) configurada
-- desde el panel del reloj.
-- -------------------------------------------------------------

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS connection_mode ENUM('auto','tcp','udp') NOT NULL DEFAULT 'auto'
    COMMENT 'Protocolo de conexión: auto=probar TCP y caer a UDP, tcp=forzar, udp=forzar',
  ADD COLUMN IF NOT EXISTS comm_password VARCHAR(30) NULL
    COMMENT 'Contraseña de comunicación configurada en el panel del reloj (commkey)',
  ADD COLUMN IF NOT EXISTS timeout_ms INT NOT NULL DEFAULT 10000
    COMMENT 'Timeout en ms para conexión y comandos ZKTeco';

-- Nota: MySQL 8.0+ soporta IF NOT EXISTS en ADD COLUMN.
-- Para MySQL 5.7 usar el bloque alternativo de abajo:
--
-- ALTER TABLE devices ADD COLUMN connection_mode ENUM('auto','tcp','udp') NOT NULL DEFAULT 'auto';
-- ALTER TABLE devices ADD COLUMN comm_password  VARCHAR(30) NULL;
-- ALTER TABLE devices ADD COLUMN timeout_ms     INT NOT NULL DEFAULT 10000;
