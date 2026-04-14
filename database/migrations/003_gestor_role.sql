-- Migration 003: Add 'gestor' role to users table
-- Run this on both local and production MySQL

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin','gestor','hr','supervisor','employee') NOT NULL DEFAULT 'employee';

-- Verify
SELECT DISTINCT role FROM users;
