/**
 * PM2 Ecosystem — SisHoras RRHH
 * Uso en producción:
 *   pm2 start ecosystem.config.js
 *   pm2 reload ecosystem.config.js --update-env
 *
 * Servicios:
 *   Core:    sishoras-api, sishoras-web, sishoras-bridge, sishoras-analytics
 *   Workers: worker-sync, worker-notifications, worker-payroll,
 *            worker-documents, worker-backups
 */
module.exports = {
  apps: [
    // ─── Core ──────────────────────────────────────────────────
    {
      name: 'sishoras-api',
      cwd: './api',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        TZ: 'America/Asuncion',
        SERVICE_NAME: 'sishoras-api',
      },
      error_file: '../logs/api-error.log',
      out_file:   '../logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '512M',
    },

    {
      name: 'sishoras-web',
      cwd: './web',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'America/Asuncion',
      },
      error_file: '../logs/web-error.log',
      out_file:   '../logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '512M',
    },

    {
      name: 'sishoras-bridge',
      cwd: './bridge',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Asuncion',
        SERVICE_NAME: 'sishoras-bridge',
      },
      error_file: '../logs/bridge-error.log',
      out_file:   '../logs/bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '256M',
    },

    {
      name: 'sishoras-analytics',
      cwd: './analytics',
      script: '.venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 5000 --workers 2',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Asuncion',
      },
      error_file: '../logs/analytics-error.log',
      out_file:   '../logs/analytics-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '512M',
    },

    // ─── Workers ───────────────────────────────────────────────
    // Todos tienen cwd: ./api para reutilizar node_modules y config.
    // Los scripts son relativos a cwd (./api).

    {
      name: 'worker-sync',
      cwd: './api',
      script: '../workers/worker-sync/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Asuncion',
        SERVICE_NAME: 'worker-sync',
        // ATT2000_INCREMENTAL_ENABLED: se lee del .env
      },
      error_file: '../logs/worker-sync-error.log',
      out_file:   '../logs/worker-sync-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '256M',
      // Reiniciar si el proceso no responde en 30s (att2000 puede tardar)
      kill_timeout: 30000,
    },

    {
      name: 'worker-notifications',
      cwd: './api',
      script: '../workers/worker-notifications/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Asuncion',
        SERVICE_NAME: 'worker-notifications',
        NOTIFICATION_WORKER_INTERVAL_MS: '10000',
        NOTIFICATION_BATCH_SIZE: '20',
      },
      error_file: '../logs/worker-notifications-error.log',
      out_file:   '../logs/worker-notifications-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '256M',
    },

    {
      name: 'worker-payroll',
      cwd: './api',
      script: '../workers/worker-payroll/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Asuncion',
        SERVICE_NAME: 'worker-payroll',
        PAYROLL_WORKER_INTERVAL_MS: '15000',
      },
      error_file: '../logs/worker-payroll-error.log',
      out_file:   '../logs/worker-payroll-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '384M',
    },

    {
      name: 'worker-documents',
      cwd: './api',
      script: '../workers/worker-documents/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Asuncion',
        SERVICE_NAME: 'worker-documents',
        DOCUMENT_WORKER_INTERVAL_MS: '10000',
      },
      error_file: '../logs/worker-documents-error.log',
      out_file:   '../logs/worker-documents-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '384M',
    },

    {
      name: 'worker-backups',
      cwd: './api',
      script: '../workers/worker-backups/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Asuncion',
        SERVICE_NAME: 'worker-backups',
        BACKUP_HOUR: '2',  // 2am UTC = 11pm Paraguay (-03)
        BACKUP_DIR: '../backups',
        BACKUP_RUN_ON_START: 'false',
      },
      error_file: '../logs/worker-backups-error.log',
      out_file:   '../logs/worker-backups-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '256M',
      // El backup corre de madrugada, no reiniciar agresivamente
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
