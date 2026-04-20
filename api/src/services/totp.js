/**
 * totp.js — TOTP RFC 6238 implementado con node crypto.
 * Sin dependencias externas. Compatible con Google Authenticator,
 * Authy, Microsoft Authenticator, 1Password, etc.
 */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ─── Base32 ────────────────────────────────────────────────────
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/,'').replace(/\s/g,'');
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Carácter inválido en base32: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ─── TOTP core ─────────────────────────────────────────────────
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function generateCode(secretB32, timestamp = Date.now(), step = 30, digits = 6) {
  const key = base32Decode(secretB32);
  const counter = Math.floor(timestamp / 1000 / step);
  const buf = Buffer.alloc(8);
  // Escribir counter como uint64 big endian
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
      ((hmac[offset]     & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8)  |
      ( hmac[offset + 3] & 0xff);

  const code = (binary % 10 ** digits).toString().padStart(digits, '0');
  return code;
}

/**
 * Verifica con ventana de tolerancia (±window pasos).
 * window=1 => acepta código actual, anterior y siguiente (≈90s).
 */
function verifyCode(secretB32, token, { window = 1, step = 30, digits = 6, timestamp = Date.now() } = {}) {
  if (!token || !secretB32) return false;
  const clean = String(token).replace(/\s/g, '');
  if (!/^\d+$/.test(clean) || clean.length !== digits) return false;

  for (let w = -window; w <= window; w++) {
    const t = timestamp + w * step * 1000;
    if (generateCode(secretB32, t, step, digits) === clean) return true;
  }
  return false;
}

/**
 * URL otpauth:// para que el usuario la pegue en su app o la frontend
 * la convierta en QR.
 *   issuer: "SisHoras"
 *   account: username o email
 */
function otpauthUrl({ secret, issuer = 'SisHoras', account = 'user' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, generateCode, verifyCode, otpauthUrl };
