-- Migration 004: Extend permission types
-- Run: sudo mysql asistencia < /var/www/html/Gestion_Horas/database/migrations/004_permissions_types.sql

ALTER TABLE permissions
  MODIFY COLUMN type ENUM('vacation','sick','personal','maternity','paternity','study','legal','other') NOT NULL;
