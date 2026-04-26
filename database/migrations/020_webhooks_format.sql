-- Migración 020: webhooks con format (slack/telegram/whatsapp/json) y channel destination

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhooks' AND COLUMN_NAME = 'format'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE webhooks ADD COLUMN format ENUM('json','slack','telegram','whatsapp','discord') NOT NULL DEFAULT 'json' AFTER events",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhooks' AND COLUMN_NAME = 'channel'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE webhooks ADD COLUMN channel VARCHAR(100) NULL AFTER format",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
