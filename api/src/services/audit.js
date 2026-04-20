/**
 * audit.js — servicio centralizado de auditoría.
 * Escribe en audit_events sin bloquear al caller (fire & forget).
 */
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

function getIp(req) {
  return req?.headers?.['x-forwarded-for']?.split(',')[0].trim()
      || req?.ip
      || req?.connection?.remoteAddress
      || null;
}
function getUA(req) {
  return req?.headers?.['user-agent']?.slice(0, 255) || null;
}

async function log({ req, user, action, entity = null, entity_id = null, details = null }) {
  try {
    await sequelize.query(
      `INSERT INTO audit_events
         (user_id, username, action, entity, entity_id, ip, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      { replacements: [
          user?.id || null,
          user?.username || null,
          action,
          entity,
          entity_id ? String(entity_id) : null,
          req ? getIp(req) : null,
          req ? getUA(req) : null,
          details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
      ]}
    );
  } catch (err) {
    // Nunca romper el flujo por falla de auditoría
    logger.warn(`audit.log falló (${action}): ${err.message}`);
  }
}

module.exports = { log };
