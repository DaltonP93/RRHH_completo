/**
 * sanitizeLog.js — Utilidad de saneamiento para logging seguro.
 *
 * Remueve o enmascara de strings y objetos:
 *   · Saltos de línea (\n, \r) → espacio (previene log injection)
 *   · Tokens JWT  (Bearer eyJ…)
 *   · Campos sensibles: password, password_hash, token, secret,
 *     api_key, authorization, cookie, signed_hash_sha256,
 *     otp_code, totp_secret
 *   · Authorization headers y cookies
 *
 * Uso:
 *   const { sanitize } = require('./sanitizeLog');
 *   logger.info(sanitize(req.body));
 *   logger.error(sanitize(errorMessage));
 */

'use strict';

// Profundidad máxima de recursión para objetos anidados
const MAX_DEPTH = 8;

// Campos cuyo valor debe ser enmascarado completamente
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'passwd',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'cookies',
  'signed_hash_sha256',
  'otp_code',
  'otp',
  'totp_secret',
  'totp',
  'private_key',
  'privatekey',
  'auth',
]);

// Patrón: Bearer + JWT (eyJ…)
const RE_JWT = /Bearer\s+eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/gi;

// Saltos de línea (log injection)
const RE_NEWLINES = /[\r\n]+/g;

/**
 * Sanea un string:
 *   1. Reemplaza saltos de línea por espacio.
 *   2. Enmascara tokens JWT.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(RE_NEWLINES, ' ')
    .replace(RE_JWT, 'Bearer [REDACTED]');
}

/**
 * Sanea un objeto de forma recursiva:
 *   · Claves sensibles → '[REDACTED]'
 *   · Valores string   → sanitizeString()
 *   · Arrays           → cada elemento saneado
 *   · Objetos anidados → recursión hasta MAX_DEPTH
 *
 * @param {object|Array} obj
 * @param {number} [depth=0]
 * @returns {object|Array}
 */
function sanitizeObject(obj, depth = 0) {
  if (depth > MAX_DEPTH) return '[MaxDepthReached]';

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, depth + 1));
  }

  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase().replace(/[-_\s]/g, '');
      if (SENSITIVE_KEYS.has(lowerKey) || SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = _sanitizeValue(value, depth + 1);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Despacha el saneamiento según el tipo del valor.
 * @private
 */
function _sanitizeValue(value, depth) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string')  return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value) || typeof value === 'object') return sanitizeObject(value, depth);
  // symbol, function, bigint — convertir a string segura
  return String(value);
}

/**
 * Punto de entrada principal.
 * Acepta string, objeto, array o cualquier primitivo.
 *
 * @param {*} input
 * @returns {*} Versión saneada del input
 */
function sanitize(input) {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string')  return sanitizeString(input);
  if (typeof input === 'object')  return sanitizeObject(input, 0);
  return input;
}

module.exports = { sanitize, sanitizeString, sanitizeObject };
