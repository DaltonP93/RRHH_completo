/**
 * devices.js
 * CRUD de relojes biométricos ZKTeco + operaciones directas.
 */
const router  = require('express').Router();
const net     = require('net');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Ping TCP ─────────────────────────────────────────────────
function pingDevice(ip, port, timeout = 3000) {
  return new Promise(resolve => {
    const start  = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve({ status: 'online',  latency: Date.now() - start }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ status: 'offline', latency: null }); });
    socket.on('error',   () => { socket.destroy(); resolve({ status: 'offline', latency: null }); });
    socket.connect(port, ip);
  });
}

// Pausa util para reintentos
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Serializar cualquier tipo de error como string legible
function fmtErr(err) {
  if (!err) return 'Error desconocido';
  // Objeto ZKLib: { err: Error, ip: string, command: string }
  if (err && typeof err === 'object' && 'command' in err) {
    const inner = err.err?.message || err.err?.code || '';
    if (err.command === 'TCP CONNECT') {
      return `No se pudo conectar al reloj${inner ? ': ' + inner : '. Verifique la red.'}`;
    }
    if (inner && inner.includes('TIMEOUT_ON_WRITING_MESSAGE') || err.message?.includes('TIMEOUT_ON_WRITING')) {
      return 'El reloj está siendo usado por otro sistema (att2000). Inténtelo en unos segundos.';
    }
    return `Error protocolo ZKTeco [${err.command}]${inner ? ': ' + inner : ': sin respuesta del dispositivo.'}`;
  }
  if (err.message) {
    if (err.message.includes('TIMEOUT_ON_WRITING_MESSAGE')) {
      return 'El reloj está ocupado (att2000 tiene sesión activa). Inténtelo en unos segundos.';
    }
    return err.message;
  }
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/**
 * Helper: conectar ZKLib, ejecutar fn, desconectar.
 * Reintenta hasta maxAttempts veces si el dispositivo está ocupado.
 * inPort=0 → OS asigna puerto local libre.
 */
async function withZK(device, fn, { maxAttempts = 3, delayMs = 3000 } = {}) {
  const ZKLib = require('node-zklib');
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const zk = new ZKLib(device.ip_address, device.port, 12000, 0);
    try {
      await zk.createSocket();
      const result = await fn(zk);
      await zk.disconnect().catch(() => {});
      return result;
    } catch (err) {
      await zk.disconnect().catch(() => {});
      lastErr = err;

      // Decidir si reintentar
      const msg = err?.message || err?.err?.message || '';
      const isBusy = msg.includes('TIMEOUT_ON_WRITING') || msg.includes('TIMEOUT_ON_WRITING_MESSAGE');
      const isConnRefused = msg.includes('ECONNREFUSED') || (err && 'command' in err && err.command === 'TCP CONNECT');

      if (isConnRefused) break; // no reintentar si el puerto está cerrado

      if (isBusy && attempt < maxAttempts) {
        await sleep(delayMs);
        continue;
      }
      break;
    }
  }

  // Convertir error ZKLib a Error legible
  if (lastErr && typeof lastErr === 'object' && 'command' in lastErr) {
    throw new Error(fmtErr(lastErr));
  }
  throw lastErr instanceof Error ? lastErr : new Error(fmtErr(lastErr));
}

// GET /api/devices
router.get('/', authorize('admin','gestor','hr'), async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM devices ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: fmtErr(err) }); }
});

// GET /api/devices/ping-all
router.get('/ping-all', authorize('admin','gestor','hr'), async (req, res) => {
  try {
    let [devices] = await sequelize.query('SELECT * FROM devices');
    if (!devices.length) {
      const DEFAULTS = [
        { name: 'Reloj Comedor',  ip_address: '172.16.20.160', port: 4370, location: 'Comedor' },
        { name: 'Reloj Lavadero', ip_address: '172.16.20.161', port: 4370, location: 'Lavadero' },
        { name: 'Reloj Gerencia', ip_address: '172.16.20.162', port: 4370, location: 'Gerencia' },
      ];
      for (const d of DEFAULTS) {
        await sequelize.query(
          'INSERT IGNORE INTO devices (name, ip_address, port, location) VALUES (?,?,?,?)',
          { replacements: [d.name, d.ip_address, d.port, d.location] }
        ).catch(() => {});
      }
      [devices] = await sequelize.query('SELECT * FROM devices');
    }
    const results = await Promise.all(devices.map(async d => {
      const { status, latency } = await pingDevice(d.ip_address, d.port);
      await sequelize.query(
        'UPDATE devices SET status=?, last_sync=NOW() WHERE id=?',
        { replacements: [status, d.id] }
      ).catch(() => {});
      return { ...d, status, latency };
    }));
    res.json(results);
  } catch (err) { res.status(500).json({ error: fmtErr(err) }); }
});

// POST /api/devices
router.post('/', authorize('admin','gestor'), async (req, res) => {
  try {
    const { name, ip_address, port = 4370, location, serial_no } = req.body;
    if (!name || !ip_address) return res.status(400).json({ error: 'Nombre e IP son requeridos' });
    const [result] = await sequelize.query(
      'INSERT INTO devices (name, ip_address, port, location, serial_no) VALUES (?,?,?,?,?)',
      { replacements: [name, ip_address, port, location || null, serial_no || null] }
    );
    res.status(201).json({ id: result.insertId, message: 'Reloj agregado' });
  } catch (err) { res.status(500).json({ error: fmtErr(err) }); }
});

// PUT /api/devices/:id
router.put('/:id', authorize('admin','gestor'), async (req, res) => {
  try {
    const { name, ip_address, port, location, serial_no } = req.body;
    await sequelize.query(
      `UPDATE devices SET
        name=COALESCE(?,name), ip_address=COALESCE(?,ip_address),
        port=COALESCE(?,port), location=COALESCE(?,location),
        serial_no=COALESCE(?,serial_no)
       WHERE id=?`,
      { replacements: [name, ip_address, port, location, serial_no, req.params.id] }
    );
    res.json({ message: 'Reloj actualizado' });
  } catch (err) { res.status(500).json({ error: fmtErr(err) }); }
});

// DELETE /api/devices/:id
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    await sequelize.query('DELETE FROM devices WHERE id=?', { replacements: [req.params.id] });
    res.json({ message: 'Reloj eliminado' });
  } catch (err) { res.status(500).json({ error: fmtErr(err) }); }
});

// GET /api/devices/:id/info — info completa del reloj vía ZKLib
// Si el reloj está ocupado, devuelve datos parciales de la BD (no 500).
router.get('/:id/info', authorize('admin','gestor','hr'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });

  // ── Datos base que siempre devolvemos (desde la BD) ──────────
  const baseInfo = {
    ok: true,
    device: device.name,
    ip: device.ip_address,
    port: device.port,
    location: device.location,
    serialNumber: device.serial_no || null,
    _source: 'db',      // indica que son datos de la BD, no en vivo
  };

  try {
    const result = await withZK(device, async zk => {
      const info = {};

      // ── 1. getInfo() — campos básicos (userCounts, logCounts, logCapacity) ──
      try {
        const basic = await zk.getInfo();
        Object.assign(info, basic);
      } catch {}

      // ── 2. CMD_GET_FREE_SIZES (50) — conteos y capacidades extendidas ──────
      // Offsets confirmados en Gerencia (3000T-C FW 6.60):
      //   24=userCounts, 32=fpCount, 40=logCounts, 44=superLogCount
      //   52=faceCount, 56=adminCount, 72=logCapacity
      //   8=freeFpSlots, 12=freeUserSlots
      try {
        const buf = await zk.executeCmd(50, '');
        const safe = (off) => {
          try { return buf.length > off + 3 ? buf.readUIntLE(off, 4) : undefined; } catch { return undefined; }
        };
        const set = (k, v) => { if (v !== undefined) info[k] = v; };

        set('fpCount',       safe(32));
        set('superLogCount', safe(44));
        set('faceCount',     safe(52));
        set('adminCount',    safe(56));

        // Capacidades = slots libres + usados
        const freeFpCount   = safe(8);
        const freeUserCount = safe(12);
        if (freeUserCount !== undefined) set('userCapacity', freeUserCount + (info.userCounts || 0));
        if (freeFpCount   !== undefined) set('fpCapacity',   freeFpCount   + (info.fpCount   || 0));
      } catch {}

      // ── 3. CMD_OPTIONS_RRQ (11) — metadata del dispositivo ───────────────
      // ZKTeco devuelve "clave=valor\0"; necesita prefijo ~ para opciones de sistema.
      const parseOptVal = (buf) => {
        const raw = buf.slice(8).toString('ascii').replace(/\0/g, '').trim();
        return raw.includes('=') ? raw.substring(raw.indexOf('=') + 1).trim() : raw;
      };

      const metaKeys = [
        [['~ProductName',  'ProductName'],       'productName'],
        [['~FirmVer',      'FirmVer'],           'firmwareVersion'],
        [['~SerialNumber', 'SerialNumber'],       'serialNumber'],
        [['~Platform',     'Platform'],           'platform'],
        [['~ZKFPVersion'],                        'fpVersion'],
        [['~Produce_Time', 'ManufactureTime'],    'manufactureTime'],
      ];
      for (const [keys, field] of metaKeys) {
        for (const key of keys) {
          if (info[field]) break;
          try {
            const buf = await zk.executeCmd(11, key);
            const val = parseOptVal(buf);
            if (val) { info[field] = val; break; }
          } catch {}
        }
      }

      return info;
    }, { maxAttempts: 3, delayMs: 3000 });

    // Guardar serial en BD si lo obtuvimos
    if (result.serialNumber && !device.serial_no) {
      sequelize.query('UPDATE devices SET serial_no=? WHERE id=?',
        { replacements: [result.serialNumber, device.id] }).catch(() => {});
    }

    res.json({ ...baseInfo, ...result, _source: 'live' });

  } catch (err) {
    const msg = fmtErr(err);
    const isBusy = msg.includes('ocupado') || msg.includes('att2000') || msg.includes('TIMEOUT');

    // Si el reloj está ocupado, devolver 200 con datos parciales de la BD
    // para que el frontend pueda mostrar algo útil
    if (isBusy) {
      return res.json({
        ...baseInfo,
        _source: 'db',
        _warning: msg,
      });
    }

    res.status(503).json({ ok: false, error: msg });
  }
});

// GET /api/devices/:id/users
router.get('/:id/users', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    const users = await withZK(device, async zk => {
      const { data } = await zk.getUsers();
      return data;
    }, { maxAttempts: 3, delayMs: 3000 });
    res.json({ device: device.name, users, total: users.length });
  } catch (err) {
    res.status(503).json({ ok: false, error: fmtErr(err) });
  }
});

// POST /api/devices/:id/backup
router.post('/:id/backup', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    const logs = await withZK(device, async zk => {
      const { data } = await zk.getAttendances();
      return data;
    }, { maxAttempts: 4, delayMs: 4000 });

    let imported = 0, skipped = 0;
    for (const log of logs) {
      const checkTime = new Date(log.attTime);
      const type = log.inOutStatus === 0 ? 'in' : 'out';
      const [[emp]] = await sequelize.query(
        'SELECT id FROM employees WHERE code=? AND status="active"',
        { replacements: [String(log.deviceUserId)] }
      );
      if (!emp) { skipped++; continue; }
      const [[existing]] = await sequelize.query(
        'SELECT id FROM attendance_logs WHERE employee_id=? AND `timestamp`=? AND source="device"',
        { replacements: [emp.id, checkTime] }
      );
      if (existing) { skipped++; continue; }
      await sequelize.query(
        'INSERT INTO attendance_logs (employee_id, device_id, `timestamp`, type, source) VALUES (?,?,?,?,?)',
        { replacements: [emp.id, device.id, checkTime, type, 'device'] }
      );
      imported++;
    }
    await sequelize.query('UPDATE devices SET last_sync=NOW() WHERE id=?', { replacements: [device.id] });
    res.json({ ok: true, total: logs.length, imported, skipped });
  } catch (err) {
    res.status(503).json({ ok: false, error: fmtErr(err) });
  }
});

// POST /api/devices/:id/clear
router.post('/:id/clear', authorize('admin'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    await withZK(device, zk => zk.clearAttendanceLog(), { maxAttempts: 3, delayMs: 3000 });
    res.json({ ok: true, message: `Registros eliminados del reloj ${device.name}` });
  } catch (err) {
    res.status(503).json({ ok: false, error: fmtErr(err) });
  }
});

// POST /api/devices/:id/disable
router.post('/:id/disable', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    await withZK(device, zk => zk.disableDevice(), { maxAttempts: 3, delayMs: 3000 });
    res.json({ ok: true, message: `Reloj ${device.name} deshabilitado` });
  } catch (err) {
    res.status(503).json({ ok: false, error: fmtErr(err) });
  }
});

// POST /api/devices/:id/enable
router.post('/:id/enable', authorize('admin','gestor'), async (req, res) => {
  const [[device]] = await sequelize.query('SELECT * FROM devices WHERE id=?', { replacements: [req.params.id] });
  if (!device) return res.status(404).json({ error: 'Reloj no encontrado' });
  try {
    await withZK(device, zk => zk.enableDevice(), { maxAttempts: 3, delayMs: 3000 });
    res.json({ ok: true, message: `Reloj ${device.name} habilitado` });
  } catch (err) {
    res.status(503).json({ ok: false, error: fmtErr(err) });
  }
});

module.exports = router;
