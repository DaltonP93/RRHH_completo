/**
 * att2000.js
 * Conexión de SOLO LECTURA a la base de datos SQL Server del
 * ZKTeco Fingerprint Attendance System (att2000).
 *
 * El nuevo sistema NUNCA escribe en att2000.
 * Solo lee para importar datos al nuevo MySQL propio.
 *
 * Variables necesarias en .env:
 *   ATT_HOST=ADVENTISTA       (nombre o IP del servidor SQL Server)
 *   ATT_PORT=1433
 *   ATT_USER=sa
 *   ATT_PASSWORD=tu_password
 *   ATT_DATABASE=att2000
 */

const sql = require('mssql');
const logger = require('./logger');

const config = {
  server:   process.env.ATT_HOST     || 'ADVENTISTA',
  port:     parseInt(process.env.ATT_PORT || '1433'),
  user:     process.env.ATT_USER     || 'sa',
  password: process.env.ATT_PASSWORD || '',
  database: process.env.ATT_DATABASE || 'att2000',
  options: {
    encrypt:                false,  // false para red local/interna
    trustServerCertificate: true,   // para SQL Server con cert autofirmado
    enableArithAbort:       true,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 15000,
  requestTimeout:    30000,
};

let pool = null;

async function getAtt2000() {
  if (pool && pool.connected) return pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    logger.info('✅ Conectado a SQL Server att2000');
    return pool;
  } catch (err) {
    logger.error('❌ Error conectando a att2000:', err.message);
    throw err;
  }
}

async function queryAtt2000(sqlText, params = {}) {
  const db = await getAtt2000();
  const request = db.request();
  for (const [key, val] of Object.entries(params)) {
    request.input(key, val);
  }
  const result = await request.query(sqlText);
  return result.recordset;
}

async function testAtt2000Connection() {
  try {
    const rows = await queryAtt2000('SELECT COUNT(*) AS total FROM CHECKINOUT');
    logger.info(`✅ att2000 OK — Total marcajes: ${rows[0].total}`);
    return { ok: true, totalRecords: rows[0].total };
  } catch (err) {
    logger.error('❌ att2000 test fallido:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { getAtt2000, queryAtt2000, testAtt2000Connection };
