/**
 * pushServer.js
 * Servidor HTTP para recibir datos en modo PUSH desde relojes ZKTeco.
 *
 * Configuración en el reloj ZKTeco:
 *   - Comm → ADMS → Server Address: IP del servidor Bridge
 *   - Port: 8080
 *   - Push Options: Activa "Realtime"
 *
 * El reloj enviará peticiones POST/GET con los marcajes al activarse.
 */

const express = require('express');

function startPushServer(publishAttendance, logger) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  /**
   * ZKTeco PUSH - El reloj hace GET a /iclock/cdata para registrarse
   * y luego POST a /iclock/cdata con los marcajes
   */
  app.get('/iclock/cdata', (req, res) => {
    const { SN, options } = req.query;
    logger.info(`🔌 Reloj ZKTeco registrado - SN: ${SN}`);

    // Respuesta que el reloj espera para confirmar registro
    res.send([
      `GET OPTION FROM: ${SN}`,
      'ATTLOGStamp=None',
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=1',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog',
      'TimeZone=-6',
      'Realtime=1',
      'Encrypt=None'
    ].join('\n'));
  });

  // El reloj envía los marcajes como POST
  app.post('/iclock/cdata', async (req, res) => {
    const { SN, table } = req.query;
    const body = req.body?.toString?.() || '';

    if (table === 'ATTLOG') {
      // Parsear líneas de marcaje
      // Formato: "UserID\tTimestamp\tStatus\tVerify\tWorkCode\n..."
      const lines = (typeof body === 'string' ? body : '').split('\n').filter(Boolean);

      for (const line of lines) {
        const parts = line.trim().split('\t');
        if (parts.length >= 2) {
          const [userId, timestamp] = parts;
          await publishAttendance({
            employeeCode: userId.trim(),
            timestamp:    new Date(timestamp.trim()).toISOString(),
            deviceIp:     SN,
            deviceId:     null,
            type:         'unknown',
            raw:          { sn: SN, line }
          });
        }
      }

      logger.info(`📥 PUSH recibido de ${SN}: ${lines.length} marcaje(s)`);
    }

    res.send('OK');
  });

  // Heartbeat del reloj
  app.get('/iclock/getrequest', (req, res) => {
    res.send('OK');
  });

  app.post('/iclock/devicecmd', (req, res) => {
    res.send('OK');
  });

  const PUSH_PORT = parseInt(process.env.PUSH_PORT || '8080');
  app.listen(PUSH_PORT, () => {
    logger.info(`📡 Servidor PUSH ZKTeco escuchando en puerto ${PUSH_PORT}`);
  });
}

module.exports = { startPushServer };
