/**
 * att2000.js
 * Conexión a la base de datos SQL Server del
 * ZKTeco Fingerprint Attendance System (att2000).
 *
 * Operaciones:
 *   - Lectura: importar datos al nuevo MySQL propio.
 *   - Escritura: insertar marcaciones desde relojes o SisHoras → att2000.
 *
 * Variables necesarias en .env:
 *   ATT_HOST=<hostname_o_ip_del_servidor>
 *   ATT_PORT=1433
 *   ATT_USER=<usuario_sql>
 *   ATT_PASSWORD=<password>
 *   ATT_DATABASE=att2000
 */

const sql = require('mssql');
const logger = require('./logger');

const config = {
  server:   process.env.ATT_HOST     || '',
  port:     parseInt(process.env.ATT_PORT || '1433'),
  user:     process.env.ATT_USER     || '',
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
let poolHost = null;  // host con el que se creó el pool actual

async function getAtt2000() {
  const currentHost = process.env.ATT_HOST || '';

  // Si el host cambió, cerrar el pool viejo y reconectar
  if (pool && poolHost !== currentHost) {
    logger.info(`🔄 Host att2000 cambió (${poolHost} → ${currentHost}), reconectando...`);
    try { await pool.close(); } catch {}
    pool = null; poolHost = null;
  }

  if (pool && pool.connected) return pool;

  try {
    // Reconstruir config con los env vars actuales (pueden haber cambiado en runtime)
    const runtimeConfig = {
      ...config,
      server:   process.env.ATT_HOST     || '',
      port:     parseInt(process.env.ATT_PORT || '1433'),
      user:     process.env.ATT_USER     || 'sa',
      password: process.env.ATT_PASSWORD ?? '',
      database: process.env.ATT_DATABASE || 'att2000',
    };
    pool = await new sql.ConnectionPool(runtimeConfig).connect();
    poolHost = runtimeConfig.server;
    logger.info(`✅ Conectado a SQL Server att2000 (${poolHost})`);
    return pool;
  } catch (err) {
    pool = null; poolHost = null;
    logger.error('❌ Error conectando a att2000:', err.message);
    throw err;
  }
}

// Resetear pool (llamar cuando cambian los parámetros de conexión)
function resetPool() {
  if (pool) { try { pool.close(); } catch {} }
  pool = null; poolHost = null;
  _columnsCache.clear();
  logger.info('🔄 Pool att2000 reseteado');
}

// ─── Introspección de schema ─────────────────────────────────────
// Cache en memoria: 'USERINFO' → Set(['USERID','Name',...])
const _columnsCache = new Map();

async function getTableColumns(table) {
  if (_columnsCache.has(table)) return _columnsCache.get(table);
  const db = await getAtt2000();
  const r = await db.request().input('t', sql.VarChar, table).query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t
  `);
  // Case-insensitive match (SQL Server devuelve el casing real)
  const cols = new Set(r.recordset.map(x => x.COLUMN_NAME));
  _columnsCache.set(table, cols);
  logger.info(`📋 ${table}: ${cols.size} columnas — ${[...cols].join(', ')}`);
  return cols;
}

// Devuelve la expresión SQL para una columna: si existe → "<prefix>COL", si no → "NULL AS COL"
function pickCol(colsSet, name, { prefix = '', alias = name } = {}) {
  // Match case-insensitive
  const real = [...colsSet].find(c => c.toLowerCase() === name.toLowerCase());
  return real ? `${prefix}${real} AS ${alias}` : `NULL AS ${alias}`;
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

/**
 * Escribir marcaciones en att2000.CHECKINOUT
 * Records esperados: array de objetos con:
 *   { userId, attTime, inOutStatus, sensorId, verifyMode }
 *   (formato de salida de node-zklib getAttendances())
 * O bien del formato interno SisHoras:
 *   { employee_code, timestamp, type, device_sensor_id }
 */
async function writeCheckinOut(records) {
  // ─── Guard de escritura ───────────────────────────────────────────
  if (process.env.ATT2000_ALLOW_WRITE !== 'true') {
    throw new Error('Escritura en att2000 deshabilitada (ATT2000_ALLOW_WRITE != true)');
  }
  const db = await getAtt2000();
  let inserted = 0, skipped = 0, errors = 0;
  const errList = [];

  for (const r of records) {
    try {
      // Normalizar campos — acepta formato ZKLib y formato SisHoras
      const userId    = r.userId    ?? r.employee_code ?? null;
      const checkTime = r.attTime   ?? r.timestamp     ?? null;
      const sensorId  = r.sensorId  ?? r.device_sensor_id ?? 0;
      const verify    = r.verifyMode ?? r.verifycode   ?? 0;

      // CHECKTYPE: ZKLib usa inOutStatus (0=in,1=out); SisHoras usa type ('in'/'out')
      let checkType = null;
      if (r.inOutStatus === 0 || r.type === 'in')  checkType = 'I';
      if (r.inOutStatus === 1 || r.type === 'out') checkType = 'O';

      if (!userId || !checkTime) { skipped++; continue; }

      const checkDt = new Date(checkTime);
      if (isNaN(checkDt.getTime())) { skipped++; continue; }

      // Verificar duplicado
      const chk = db.request();
      chk.input('uid', sql.Int,      parseInt(userId));
      chk.input('ct',  sql.DateTime, checkDt);
      const dup = await chk.query(
        'SELECT COUNT(*) AS cnt FROM CHECKINOUT WHERE USERID=@uid AND CHECKTIME=@ct'
      );
      if (dup.recordset[0].cnt > 0) { skipped++; continue; }

      // Insertar
      const ins = db.request();
      ins.input('uid',      sql.Int,      parseInt(userId));
      ins.input('ct',       sql.DateTime, checkDt);
      ins.input('sensor',   sql.Int,      sensorId || 0);
      ins.input('verify',   sql.Int,      verify   || 0);
      ins.input('ctype',    sql.VarChar,  checkType || null);
      await ins.query(`
        INSERT INTO CHECKINOUT (USERID, CHECKTIME, SENSORID, VERIFYCODE, CHECKTYPE)
        VALUES (@uid, @ct, @sensor, @verify, @ctype)
      `);
      inserted++;
    } catch (e) {
      errors++;
      errList.push({ record: r.userId ?? r.employee_code, error: e.message });
    }
  }

  logger.info(`writeCheckinOut: ${inserted} insertados, ${skipped} duplicados, ${errors} errores`);
  return { inserted, skipped, errors, errList };
}

// ─── Funciones de consulta seguras ───────────────────────────────
async function diagnoseAtt2000Schema() {
  // Devuelve tablas con conteo de columnas
  const db = await getAtt2000();
  const r = await db.request().query(`
    SELECT TABLE_NAME, COUNT(*) AS col_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME IN ('CHECKINOUT','USERINFO','DEPARTMENTS','ICLOCK')
    GROUP BY TABLE_NAME
  `);
  return r.recordset;
}

async function getAtt2000TableCounts() {
  // Conteos de tablas principales
  const db = await getAtt2000();
  const queries = [
    'SELECT COUNT(*) AS cnt FROM CHECKINOUT',
    'SELECT COUNT(*) AS cnt FROM USERINFO',
    'SELECT COUNT(*) AS cnt FROM DEPARTMENTS',
  ];
  const results = {};
  for (const q of queries) {
    try {
      const r = await db.request().query(q);
      const table = q.match(/FROM (\w+)/)[1];
      results[table] = r.recordset[0].cnt;
    } catch { results[q.match(/FROM (\w+)/)[1]] = null; }
  }
  return results;
}

async function fetchAttDepartments() {
  const db = await getAtt2000();
  const r = await db.request().query('SELECT * FROM DEPARTMENTS');
  return r.recordset;
}

async function fetchAttUsers({ limit = 1000, offset = 0 } = {}) {
  const db = await getAtt2000();
  const r = await db.request()
    .input('lim', sql.Int, limit)
    .input('off', sql.Int, offset)
    .query('SELECT * FROM USERINFO ORDER BY USERID OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY');
  return r.recordset;
}

async function fetchAttPunches({ from, to, limit = 10000, offset = 0 } = {}) {
  const db = await getAtt2000();
  const r = await db.request()
    .input('from', sql.DateTime, new Date(from))
    .input('to',   sql.DateTime, new Date(to))
    .input('lim',  sql.Int, limit)
    .input('off',  sql.Int, offset)
    .query(`SELECT USERID, CHECKTIME, CHECKTYPE, SENSORID, VERIFYCODE
            FROM CHECKINOUT
            WHERE CHECKTIME >= @from AND CHECKTIME <= @to
            ORDER BY CHECKTIME
            OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`);
  return r.recordset;
}

async function fetchAttPunchesSince({ since, limit = 5000 } = {}) {
  const db = await getAtt2000();
  const r = await db.request()
    .input('since', sql.DateTime, new Date(since))
    .input('lim',   sql.Int, limit)
    .query(`SELECT TOP (@lim) USERID, CHECKTIME, CHECKTYPE, SENSORID, VERIFYCODE
            FROM CHECKINOUT
            WHERE CHECKTIME >= @since
            ORDER BY CHECKTIME`);
  return r.recordset;
}

async function fetchAttPunchesByUser({ sourceUserId, from, to } = {}) {
  const db = await getAtt2000();
  const r = await db.request()
    .input('uid',  sql.Int,      parseInt(sourceUserId))
    .input('from', sql.DateTime, new Date(from))
    .input('to',   sql.DateTime, new Date(to))
    .query(`SELECT USERID, CHECKTIME, CHECKTYPE, SENSORID, VERIFYCODE
            FROM CHECKINOUT
            WHERE USERID = @uid AND CHECKTIME >= @from AND CHECKTIME <= @to
            ORDER BY CHECKTIME`);
  return r.recordset;
}

async function getAtt2000DateRange() {
  const db = await getAtt2000();
  const r = await db.request().query(`
    SELECT MIN(CHECKTIME) AS min_date, MAX(CHECKTIME) AS max_date,
           COUNT(*) AS total FROM CHECKINOUT
  `);
  return r.recordset[0];
}

module.exports = {
  getAtt2000,
  queryAtt2000,
  testAtt2000Connection,
  writeCheckinOut,
  resetPool,
  getTableColumns,
  pickCol,
  diagnoseAtt2000Schema,
  getAtt2000TableCounts,
  fetchAttDepartments,
  fetchAttUsers,
  fetchAttPunches,
  fetchAttPunchesSince,
  fetchAttPunchesByUser,
  getAtt2000DateRange,
};
