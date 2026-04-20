/**
 * twofaController.js — gestión de 2FA TOTP del usuario autenticado.
 */
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');
const totp  = require('../services/totp');
const audit = require('../services/audit');
const logger = require('../config/logger');

// POST /api/auth/2fa/setup
// Genera un secreto temporal (NO lo guarda aún) y devuelve otpauth URL.
// El cliente muestra un QR + pide al usuario confirmar con verify.
async function setup2fa(req, res) {
  try {
    const [[user]] = await sequelize.query(
      'SELECT id, username, email, twofa_enabled FROM users WHERE id = ?',
      { replacements: [req.user.id] }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.twofa_enabled) return res.status(409).json({ error: '2FA ya está habilitado. Deshabilitalo primero.' });

    const secret = totp.generateSecret(20);
    // Guardamos el secreto pero con twofa_enabled = 0 hasta que verifique
    await sequelize.query(
      'UPDATE users SET twofa_secret = ?, twofa_enabled = 0 WHERE id = ?',
      { replacements: [secret, req.user.id] }
    );

    const url = totp.otpauthUrl({
      secret,
      issuer: 'SisHoras',
      account: user.email || user.username,
    });

    res.json({ secret, otpauthUrl: url });
  } catch (err) {
    logger.error('setup2fa error:', err);
    res.status(500).json({ error: err.message });
  }
}

// POST /api/auth/2fa/verify  { otp }
// Activa definitivamente si el código es válido.
async function verify2fa(req, res) {
  const { otp } = req.body || {};
  if (!otp) return res.status(400).json({ error: 'Código requerido' });

  try {
    const [[user]] = await sequelize.query(
      'SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?',
      { replacements: [req.user.id] }
    );
    if (!user?.twofa_secret) return res.status(400).json({ error: 'Ejecutá /setup primero' });

    const ok = totp.verifyCode(user.twofa_secret, otp, { window: 1 });
    if (!ok) return res.status(401).json({ error: 'Código incorrecto' });

    await sequelize.query(
      'UPDATE users SET twofa_enabled = 1, twofa_enabled_at = NOW() WHERE id = ?',
      { replacements: [req.user.id] }
    );
    audit.log({ req, user: req.user, action: '2fa_enable' });
    res.json({ message: '2FA habilitado. Guardá la app en un lugar seguro.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/auth/2fa/disable  { currentPassword, otp }
async function disable2fa(req, res) {
  const { currentPassword, otp } = req.body || {};
  if (!currentPassword || !otp) return res.status(400).json({ error: 'Password y código 2FA requeridos' });

  try {
    const [[user]] = await sequelize.query(
      'SELECT password_hash, twofa_secret, twofa_enabled FROM users WHERE id = ?',
      { replacements: [req.user.id] }
    );
    if (!user?.twofa_enabled) return res.status(400).json({ error: '2FA no está habilitado' });

    const pwOk  = await bcrypt.compare(currentPassword, user.password_hash);
    const otpOk = totp.verifyCode(user.twofa_secret, otp, { window: 1 });
    if (!pwOk || !otpOk) return res.status(401).json({ error: 'Credenciales inválidas' });

    await sequelize.query(
      'UPDATE users SET twofa_secret = NULL, twofa_enabled = 0, twofa_enabled_at = NULL WHERE id = ?',
      { replacements: [req.user.id] }
    );
    audit.log({ req, user: req.user, action: '2fa_disable' });
    res.json({ message: '2FA deshabilitado.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/auth/2fa/status
async function status2fa(req, res) {
  try {
    const [[user]] = await sequelize.query(
      'SELECT twofa_enabled, twofa_enabled_at FROM users WHERE id = ?',
      { replacements: [req.user.id] }
    );
    res.json({ enabled: !!user?.twofa_enabled, enabledAt: user?.twofa_enabled_at || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { setup2fa, verify2fa, disable2fa, status2fa };
