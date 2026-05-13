const winston = require('winston');

// Formato personalizado que incluye request_id y user_id del contexto AsyncLocalStorage
const contextFormat = winston.format((info) => {
  try {
    const { getRequestId, getContextUser } = require('../middleware/requestId');
    const rid = getRequestId();
    const uid = getContextUser();
    if (rid) info.request_id = rid;
    if (uid) info.user_id = uid;
  } catch {
    // Módulo no cargado aún (inicio) — continuar sin contexto
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: process.env.SERVICE_NAME || 'sishoras-api' },
  format: winston.format.combine(
    contextFormat(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, request_id, user_id, service, ...meta }) => {
          const rid = request_id ? ` [${request_id.slice(0, 8)}]` : '';
          const uid = user_id ? ` u:${user_id}` : '';
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}]${rid}${uid} ${message}${extra}`;
        })
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

module.exports = logger;
