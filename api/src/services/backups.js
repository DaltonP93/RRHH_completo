/**
 * backups.js
 * Backups automáticos de MySQL via mysqldump.
 *
 * - Ejecuta mysqldump en BACKUP_DIR
 * - Comprime con gzip
 * - Mantiene retención (BACKUP_RETENTION_DAYS, default 14 días)
 * - Cron configurable con BACKUP_CRON (default '0 2 * * *' — 2 AM diario)
 */
const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const cron   = require('node-cron');
const logger = require('../config/logger');

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups'));
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10);

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

let _job = null;

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function runBackup() {
  const filename = `asistencia_${timestamp()}.sql.gz`;
  const fullPath = path.join(BACKUP_DIR, filename);

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      MYSQL_PWD: process.env.DB_PASSWORD || '',
    };
    const dumpArgs = [
      '-h', process.env.DB_HOST || 'localhost',
      '-P', String(process.env.DB_PORT || 3306),
      '-u', process.env.DB_USER || 'root',
      '--single-transaction', '--quick', '--lock-tables=false',
      '--routines', '--triggers', '--events',
      process.env.DB_NAME || 'asistencia',
    ];

    const dump = spawn('mysqldump', dumpArgs, { env });
    const gzip = spawn('gzip', ['-c']);
    const out  = fs.createWriteStream(fullPath);

    let stderrBuf = '';
    dump.stderr.on('data', (d) => { stderrBuf += d.toString(); });
    dump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(out);

    let dumpExit = null, gzipExit = null;
    function check() {
      if (dumpExit == null || gzipExit == null) return;
      if (dumpExit !== 0) return reject(new Error(`mysqldump exit ${dumpExit}: ${stderrBuf}`));
      if (gzipExit !== 0) return reject(new Error(`gzip exit ${gzipExit}`));
      out.on('close', () => {
        const stat = fs.statSync(fullPath);
        resolve({ filename, path: fullPath, size: stat.size, created_at: new Date() });
      });
      out.end();
    }
    dump.on('exit', (c) => { dumpExit = c; check(); });
    gzip.on('exit', (c) => { gzipExit = c; check(); });
    dump.on('error', reject);
    gzip.on('error', reject);
  });
}

async function purgeOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = await promisify(fs.readdir)(BACKUP_DIR);
  let removed = 0;
  for (const f of files) {
    if (!/^asistencia_.*\.sql\.gz$/.test(f)) continue;
    const fp = path.join(BACKUP_DIR, f);
    const st = fs.statSync(fp);
    if (st.mtimeMs < cutoff) {
      fs.unlinkSync(fp);
      removed++;
    }
  }
  return removed;
}

async function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const files = await promisify(fs.readdir)(BACKUP_DIR);
  return files
    .filter(f => /^asistencia_.*\.sql\.gz$/.test(f))
    .map(f => {
      const fp = path.join(BACKUP_DIR, f);
      const st = fs.statSync(fp);
      return { filename: f, size: st.size, created_at: st.mtime };
    })
    .sort((a, b) => b.created_at - a.created_at);
}

function startBackupCron() {
  const expr = process.env.BACKUP_CRON || '0 2 * * *'; // 2 AM diario
  if (process.env.BACKUP_DISABLED === '1') {
    logger.info('⏸️  Backups automáticos deshabilitados (BACKUP_DISABLED=1)');
    return;
  }
  if (!cron.validate(expr)) {
    logger.warn(`Expresión cron inválida para backups: ${expr}`);
    return;
  }
  if (_job) _job.stop();
  _job = cron.schedule(expr, async () => {
    try {
      logger.info('🗄️  Iniciando backup automático de BD...');
      const result = await runBackup();
      const purged = await purgeOldBackups();
      logger.info(`✅ Backup OK: ${result.filename} (${(result.size/1024/1024).toFixed(2)} MB). Purgados: ${purged}`);
    } catch (err) {
      logger.error('❌ Backup automático falló:', err.message);
    }
  }, { timezone: process.env.CRON_TZ || 'America/Asuncion' });
  logger.info(`📅 Cron de backups activo: ${expr}, retención ${RETENTION_DAYS} días, dir ${BACKUP_DIR}`);
}

module.exports = {
  BACKUP_DIR,
  runBackup,
  purgeOldBackups,
  listBackups,
  startBackupCron,
};
