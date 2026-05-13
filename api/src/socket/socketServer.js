const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

let io;

async function initSocket(server) {
  const rawOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
  const allowedOrigins = Array.from(new Set([
    rawOrigin,
    rawOrigin.replace(/^http:\/\//,  'https://'),
    rawOrigin.replace(/^https:\/\//, 'http://'),
    'http://localhost:3000',
    'https://localhost:3000',
    'http://sishoras.saa.com.py',
    'https://sishoras.saa.com.py',
  ]));

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter para escalabilidad horizontal (múltiples instancias API)
  if (process.env.REDIS_URL || process.env.SOCKET_REDIS_URL) {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');

      const redisUrl = process.env.SOCKET_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();

      pubClient.on('error', err => logger.warn(`Socket Redis pub error: ${err.message}`));
      subClient.on('error', err => logger.warn(`Socket Redis sub error: ${err.message}`));

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.io Redis adapter activo — escalabilidad horizontal habilitada');
    } catch (err) {
      logger.warn(`Redis adapter no disponible, usando memoria local: ${err.message}`);
    }
  }

  // Middleware de autenticación para WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token requerido'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket conectado: ${socket.id} | Usuario: ${socket.user?.username}`);

    socket.join(`role:${socket.user.role}`);
    socket.join(`user:${socket.user.id}`);

    socket.on('disconnect', () => {
      logger.info(`Socket desconectado: ${socket.id}`);
    });
  });

  logger.info('Socket.io listo');
  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io no inicializado');
  return io;
}

module.exports = { initSocket, getIO, get io() { return io; } };
