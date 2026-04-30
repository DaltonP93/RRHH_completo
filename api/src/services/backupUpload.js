/**
 * backupUpload.js — Sube backups a almacenamiento externo tras generarlos.
 *
 * Soporta:
 *   - S3 / MinIO  (protocolo S3-compatible, usa @aws-sdk/client-s3 + @aws-sdk/lib-storage)
 *   - SFTP        (usa ssh2-sftp-client)
 *
 * Variables de entorno (o system_settings):
 *   BACKUP_UPLOAD_PROVIDER  = 's3' | 'sftp' | ''  (vacío = no subir)
 *
 *   S3 / MinIO:
 *     BACKUP_S3_ENDPOINT    = https://s3.amazonaws.com  (vacío = AWS)
 *     BACKUP_S3_BUCKET      = mis-backups
 *     BACKUP_S3_ACCESS_KEY
 *     BACKUP_S3_SECRET_KEY
 *     BACKUP_S3_REGION      = us-east-1
 *     BACKUP_S3_PATH_PREFIX = sishoras/           (prefijo dentro del bucket)
 *
 *   SFTP:
 *     BACKUP_SFTP_HOST
 *     BACKUP_SFTP_PORT      = 22
 *     BACKUP_SFTP_USER
 *     BACKUP_SFTP_PASSWORD
 *     BACKUP_SFTP_KEY       = ruta a clave privada PEM (alternativa a PASSWORD)
 *     BACKUP_SFTP_REMOTE_DIR = /backups/sishoras/
 */
const fs      = require('fs');
const path    = require('path');
const logger  = require('../config/logger');
const { sequelize } = require('../config/database');

// ── Leer configuración desde settings o env ────────────────────

async function getUploadConfig() {
  try {
    const keys = [
      'backup_upload_provider',
      'backup_s3_endpoint', 'backup_s3_bucket', 'backup_s3_access_key',
      'backup_s3_secret_key', 'backup_s3_region', 'backup_s3_path_prefix',
      'backup_sftp_host', 'backup_sftp_port', 'backup_sftp_user',
      'backup_sftp_password', 'backup_sftp_key', 'backup_sftp_remote_dir',
    ];
    const [rows] = await sequelize.query(
      `SELECT key_name, value FROM system_settings WHERE key_name IN (${keys.map(() => '?').join(',')})`,
      { replacements: keys }
    );
    const map = {};
    for (const r of rows) map[r.key_name] = r.value;
    return {
      provider:  map.backup_upload_provider  || process.env.BACKUP_UPLOAD_PROVIDER || '',
      s3: {
        endpoint:   map.backup_s3_endpoint   || process.env.BACKUP_S3_ENDPOINT || '',
        bucket:     map.backup_s3_bucket     || process.env.BACKUP_S3_BUCKET || '',
        accessKey:  map.backup_s3_access_key || process.env.BACKUP_S3_ACCESS_KEY || '',
        secretKey:  map.backup_s3_secret_key || process.env.BACKUP_S3_SECRET_KEY || '',
        region:     map.backup_s3_region     || process.env.BACKUP_S3_REGION || 'us-east-1',
        prefix:     map.backup_s3_path_prefix|| process.env.BACKUP_S3_PATH_PREFIX || 'sishoras/',
      },
      sftp: {
        host:       map.backup_sftp_host      || process.env.BACKUP_SFTP_HOST || '',
        port:       parseInt(map.backup_sftp_port || process.env.BACKUP_SFTP_PORT || '22', 10),
        user:       map.backup_sftp_user      || process.env.BACKUP_SFTP_USER || '',
        password:   map.backup_sftp_password  || process.env.BACKUP_SFTP_PASSWORD || '',
        privateKey: map.backup_sftp_key       || process.env.BACKUP_SFTP_KEY || '',
        remoteDir:  map.backup_sftp_remote_dir|| process.env.BACKUP_SFTP_REMOTE_DIR || '/backups/',
      },
    };
  } catch {
    return { provider: process.env.BACKUP_UPLOAD_PROVIDER || '', s3: {}, sftp: {} };
  }
}

// ── S3 / MinIO upload ──────────────────────────────────────────

async function uploadS3(cfg, filePath, filename) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { Upload } = require('@aws-sdk/lib-storage');

  const clientOpts = {
    region: cfg.region || 'us-east-1',
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  };
  if (cfg.endpoint) {
    clientOpts.endpoint = cfg.endpoint;
    clientOpts.forcePathStyle = true;  // MinIO requiere path-style
  }

  const client = new S3Client(clientOpts);
  const key    = (cfg.prefix || '') + filename;

  const upload = new Upload({
    client,
    params: {
      Bucket:      cfg.bucket,
      Key:         key,
      Body:        fs.createReadStream(filePath),
      ContentType: 'application/gzip',
    },
  });

  await upload.done();
  return { provider: 's3', key, bucket: cfg.bucket };
}

// ── SFTP upload ────────────────────────────────────────────────

async function uploadSFTP(cfg, filePath, filename) {
  const SftpClient = require('ssh2-sftp-client');
  const sftp = new SftpClient();

  const connOpts = {
    host: cfg.host,
    port: cfg.port,
    username: cfg.user,
  };
  if (cfg.privateKey && fs.existsSync(cfg.privateKey)) {
    connOpts.privateKey = fs.readFileSync(cfg.privateKey);
  } else {
    connOpts.password = cfg.password;
  }

  await sftp.connect(connOpts);
  const remoteDir  = cfg.remoteDir.endsWith('/') ? cfg.remoteDir : cfg.remoteDir + '/';
  const remotePath = remoteDir + filename;

  // Crear directorio si no existe
  try { await sftp.mkdir(remoteDir, true); } catch {}

  await sftp.fastPut(filePath, remotePath);
  await sftp.end();
  return { provider: 'sftp', remotePath };
}

// ── Dispatcher ─────────────────────────────────────────────────

/**
 * uploadBackup(filePath, filename)
 * Sube el backup al proveedor configurado.
 * Si no hay proveedor configurado, no hace nada (no lanza error).
 */
async function uploadBackup(filePath, filename) {
  const cfg = await getUploadConfig();
  if (!cfg.provider) {
    logger.debug('Backup off-site: proveedor no configurado, se omite subida.');
    return null;
  }

  logger.info(`☁️  Subiendo backup a ${cfg.provider}: ${filename}`);
  try {
    let result;
    if (cfg.provider === 's3') {
      result = await uploadS3(cfg.s3, filePath, filename);
    } else if (cfg.provider === 'sftp') {
      result = await uploadSFTP(cfg.sftp, filePath, filename);
    } else {
      logger.warn(`Backup off-site: proveedor desconocido "${cfg.provider}"`);
      return null;
    }
    logger.info(`✅ Backup subido: ${JSON.stringify(result)}`);

    // Notificar vía webhook si está configurado
    try {
      const [settingRow] = await sequelize.query(
        "SELECT value FROM system_settings WHERE key_name = 'webhook_notify_backup'",
        { replacements: [] }
      );
      const notify = settingRow[0]?.value === '1' || process.env.WEBHOOK_NOTIFY_BACKUP === '1';
      if (notify) {
        const wh = require('./notificationWebhooks');
        const sizeMb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
        await wh.notifyBackupOk(filename, sizeMb).catch(() => {});
      }
    } catch {}

    return result;
  } catch (err) {
    logger.error(`❌ Error subiendo backup off-site: ${err.message}`);
    throw err;
  }
}

module.exports = { uploadBackup, getUploadConfig };
