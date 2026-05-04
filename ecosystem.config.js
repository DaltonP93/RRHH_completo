/**
 * PM2 Ecosystem — SisHoras
 * Uso en producción:
 *   pm2 start ecosystem.config.js
 *   pm2 reload ecosystem.config.js --update-env
 */
module.exports = {
  apps: [
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
        TZ: 'America/Asuncion',   // Paraguay — corrige timestamps en logs y queries
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
      },
      error_file: '../logs/bridge-error.log',
      out_file:   '../logs/bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '256M',
    },
  ],
}
