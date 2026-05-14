-- ============================================================
-- Seed de staging — datos mínimos para entorno de prueba
-- Sin credenciales reales. El administrador DEBE cambiar la
-- contraseña en el primer inicio de sesión.
-- INSERT IGNORE garantiza idempotencia.
-- ============================================================

-- ─── Company demo ────────────────────────────────────────────
INSERT IGNORE INTO companies (id, name, ruc, country_code, status, created_at)
VALUES (1, 'Empresa Demo S.A.', '80000001-0', 'PY', 'active', NOW());

-- ─── Branch ──────────────────────────────────────────────────
INSERT IGNORE INTO branches (id, company_id, name, is_main, status, created_at)
VALUES (1, 1, 'Sede Central', 1, 'active', NOW());

-- ─── Roles base ──────────────────────────────────────────────
INSERT IGNORE INTO roles (id, name, display_name, is_system, created_at)
VALUES
  (1, 'super_admin', 'Super Administrador', 1, NOW()),
  (2, 'admin',       'Administrador',       1, NOW()),
  (3, 'hr',          'Recursos Humanos',    1, NOW()),
  (4, 'manager',     'Jefe / Gerente',      1, NOW()),
  (5, 'employee',    'Empleado',            1, NOW());

-- ─── Usuario superadmin ──────────────────────────────────────
-- password_hash: bcrypt de 'CambiarEstaContrasena2025!'
-- (ronda 10 — placeholder; el administrador DEBE regenerarlo
--  con bcrypt real antes de poner en producción)
INSERT IGNORE INTO users
  (id, username, email, password_hash, role, company_id,
   must_change_password, status, created_at)
VALUES
  (
    1,
    'superadmin',
    'admin@demo.local',
    '$2b$10$rKJ8LxM2vN5qP3wQ9uY7eOiZtAHgBcDsEnFmGpHjIkLnMoOpQrSt',
    'super_admin',
    1,
    1,
    'active',
    NOW()
  );

-- ─── Parámetros IPS (Paraguay) ───────────────────────────────
INSERT IGNORE INTO settings (`key`, `value`, description, data_type, is_public)
VALUES
  ('ips.employee_rate',  '9',       'Aporte obrero IPS (%)',         'float',   0),
  ('ips.employer_rate',  '16.5',    'Aporte patronal IPS (%)',        'float',   0),
  ('payroll.min_salary', '2700000', 'Salario mínimo PY (Guaraníes)', 'integer', 0);

-- ─── Canales de notificación ─────────────────────────────────
INSERT IGNORE INTO notification_channels (id, channel, enabled, config_json, created_at)
VALUES
  (1, 'email',    0, '{"provider":"smtp","host":"","port":587}', NOW()),
  (2, 'internal', 1, '{}',                                       NOW());
