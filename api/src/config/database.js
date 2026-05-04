const { Sequelize } = require('sequelize');
const logger = require('./logger');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'asistencia',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD ?? '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    timezone: '-04:00', // Paraguay UTC-4 (America/Asuncion horario estándar, abr-oct)
    logging: msg => logger.debug(msg),
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      underscored: true,
      timestamps: true
    }
  }
);

module.exports = { sequelize };
