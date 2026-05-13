/**
 * worker-backups — Backup automático con política de retención
 *
 * Corre como proceso PM2 separado (cwd: api/).
 * Ejecuta backup diario de MySQL y uploads.
 * Aplica política de retención:
 *   - Diarios: 14 días
 *   - Semanales: 8 semanas  (se guarda el del lunes)
 *   - Mensuales: 12 meses   (se guarda el del día 1)
 *   - Anuales:  5 años      (se guarda el del 1 de enero)
 *
 * Variables de entorno:
 *   BACKUP_DIR             = ./backups
 *   BACKUP_HOUR            = 2  (hora UTC para ejecutar, default 2am)
 *   BACKUP_ENCRYPT         = false
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

require('dotenv').config();
process.env.SERVICE_NAME = 'worker-backups';

const fs          = require('fs');
const path        = require('path');
const { exec }    = require('child_process');
const { promisify } = require('util');
const { sequelize } = require('./src/config/database');
const logger      = require('./src/config/logger');

const execAsync = promisify(exec);

const BACKUP_DIR  = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
const BACKUP_HOUR = parseInt(process.env.BACKUP_HOUR || '2');

// Política de retención en días
const RETENTION = {
  daily:   14,
  weekly:  56,   // 8 semanas
  monthly: 365,  // 12 meses
  annual:  1825, // 5 años
};

// Crear directorios
for (const type of ['daily', 'weekly', 'monthly', 'annual', 'uploads']) {
  const dir = path.join(BACKUP_DIR, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Backup MySQL ────────────────────────────────────────────────
async function backupMysql(outputPath) {
  const host     = process.env.DB_HOST || 'localhost';
  const port     = process.env.DB_PORT || '3306';
  const db       = process.env.DB_NAME || 'asistencia';
  const user     = process.env.DB_USER || 'asistencia_user';
  const password = process.env.DB_PASSWORD || '';

  const cmd = `mysqldump -h ${host} -P ${port} -u ${user} --password='${password}' ` +
    `--single-transaction --routines --triggers --events ` +
    `${db} | gzip > ${outputPath}.gz`;

  await execAsync(cmd);
  return `${outputPath}.gz`;
}

// ─── Backup uploads ──────────────────────────────────────────────
async function backupUploads(outputPath) {
  const uploadsDir = process.env.DOCUMENT_STORAGE_PATH ||
    path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) return null;

  await execAsync(`tar -czf ${outputPath} -C ${path.dirname(uploadsDir)} ${path.basename(uploadsDir)}`);
  return outputPath;
}

// ─── Determinar tipo de backup ───────────────────────────────────
function getBackupType(date) {
  if (date.getMonth() === 0 && date.getDate() === 1) return 'annual';
  if (date.getDate() === 1) return 'monthly';
  if (date.getDay() === 1) return 'weekly'; // lunes
  return 'daily';
}

// ─── Ejecutar backup ─────────────────────────────────────────────
async function runBackup() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const type = getBackupType(now);
  const label = `backup_${dateStr}`;

  logger.info(`Iniciando backup ${type} — ${dateStr}`);

  const results = {};

  try {
    // MySQL dump
    const sqlPath = path.join(BACKUP_DIR, type, `${label}_mysql`);
    const sqlFile = await backupMysql(sqlPath);
    const sqlSize = fs.existsSync(sqlFile) ? fs.statSync(sqlFile).size : 0;
    results.mysql = { file: sqlFile, size: sqlSize };
    logger.info(`MySQL backup: ${path.basename(sqlFile)} (${(sqlSize / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    results.mysql = { error: err.message };
    logger.error('Error en MySQL backup: ' + err.message);
  }

  try {
    // Uploads tar
    const tarPath = path.join(BACKUP_DIR, type, `${label}_uploads.tar.gz`);
    const tarFile = await backupUploads(tarPath);
    if (tarFile) {
      const tarSize = fs.statSync(tarFile).size;
      results.uploads = { file: tarFile, size: tarSize };
      logger.info(`Uploads backup: ${path.basename(tarFile)} (${(tarSize / 1024 / 1024).toFixed(1)} MB)`);
    }
  } catch (err) {
    results.uploads = { error: err.message };
    logger.warn('Error en uploads backup: ' + err.message);
  }

  // Registrar en DB
  try {
    await sequelize.query(`
      INSERT INTO backup_logs (backup_type, backup_date, status, details_json, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `, { replacements: [
      type, dateStr,
      results.mysql?.error ? 'failed' : 'success',
      JSON.stringify(results)
    ]}).catch(() => {}); // tabla puede no existir
  } catch {}

  logger.info(`Backup ${type} completado`);
}

// ─── Limpieza por retención ──────────────────────────────────────
async function cleanOldBackups() {
  const now = Date.now();

  for (const [type, days] of Object.entries(RETENTION)) {
    const dir = path.join(BACKUP_DIR, type);
    if (!fs.existsSync(dir)) continue;

    const cutoff = now - days * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      const mtime = fs.statSync(filePath).mtimeMs;
      if (mtime < cutoff) {
        fs.unlinkSync(filePath);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`Limpieza ${type}: ${removed} archivos eliminados (>${days} días)`);
    }
  }
}

// ─── Scheduler: esperar la hora configurada ──────────────────────
function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(BACKUP_HOUR, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleNext() {
  const ms = msUntilNextRun();
  const nextRun = new Date(Date.now() + ms);
  logger.info(`Próximo backup: ${nextRun.toISOString()} (en ${Math.round(ms / 60000)} minutos)`);

  setTimeout(async () => {
    await runBackup();
    await cleanOldBackups();
    scheduleNext(); // reprogramar
  }, ms);
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  logger.info(`worker-backups iniciado — dir: ${BACKUP_DIR} — hora: ${BACKUP_HOUR}:00 UTC`);

  // Si es la primera vez, crear log inicial sin backup
  await sequelize.authenticate().catch(() => {});

  // ¿Ya se hizo el backup de hoy?
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayBackupExists = fs.existsSync(path.join(BACKUP_DIR, 'daily')) &&
    fs.readdirSync(path.join(BACKUP_DIR, 'daily')).some(f => f.includes(todayStr));

  if (!todayBackupExists && process.env.BACKUP_RUN_ON_START === 'true') {
    logger.info('Ejecutando backup inicial...');
    await runBackup();
    await cleanOldBackups();
  }

  scheduleNext();
}

main().catch(err => {
  logger.error('worker-backups error fatal: ' + err.message);
  process.exit(1);
});
