/**
 * inspect-att2000.js
 * Inspecciona y muestra un resumen de la base de datos att2000
 * del ZKTeco Fingerprint Attendance System (SQL Server).
 *
 * Uso:
 *   npm install mssql
 *   node scripts/inspect-att2000.js
 */

const sql = require('mssql');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function main() {
  console.log('\n🔍 Inspector att2000 — ZKTeco Fingerprint Attendance System\n');

  const server   = await ask('Servidor SQL Server (ADVENTISTA o IP): ');
  const user     = await ask('Usuario (sa): ') || 'sa';
  const password = await ask('Contraseña: ');

  const config = {
    server: server.trim() || 'ADVENTISTA',
    user:   user.trim(),
    password,
    database: 'att2000',
    options: { encrypt: false, trustServerCertificate: true },
  };

  console.log('\n⏳ Conectando a SQL Server...\n');

  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    console.log('✅ Conexión exitosa!\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\nVerifica:');
    console.log('  - El nombre del servidor (debe ser accesible desde esta PC)');
    console.log('  - SQL Server tiene habilitadas conexiones TCP/IP');
    console.log('  - El usuario "sa" tiene permisos en att2000');
    rl.close();
    return;
  }

  const req = () => pool.request();

  // ─── CHECKINOUT ──────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('📋 CHECKINOUT (Marcajes)');
  console.log('═'.repeat(60));

  const count = await req().query('SELECT COUNT(*) AS total FROM CHECKINOUT');
  console.log(`Total registros: ${count.recordset[0].total.toLocaleString()}`);

  const minMax = await req().query(`
    SELECT MIN(CHECKTIME) AS desde, MAX(CHECKTIME) AS hasta FROM CHECKINOUT
  `);
  const mm = minMax.recordset[0];
  console.log(`Rango de fechas: ${mm.desde} → ${mm.hasta}`);

  const sample = await req().query(`
    SELECT TOP 3 USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID
    FROM CHECKINOUT ORDER BY CHECKTIME DESC
  `);
  console.log('\nÚltimos 3 marcajes:');
  sample.recordset.forEach(r => {
    console.log(`  UserID:${r.USERID} | ${r.CHECKTIME} | Tipo:${r.CHECKTYPE || '?'} | Sensor:${r.SENSORID}`);
  });

  // CHECKTYPE analysis
  const types = await req().query(`
    SELECT CHECKTYPE, COUNT(*) AS total
    FROM CHECKINOUT
    GROUP BY CHECKTYPE
    ORDER BY total DESC
  `);
  console.log('\nValores de CHECKTYPE:');
  types.recordset.forEach(t => console.log(`  '${t.CHECKTYPE}' → ${t.total} registros`));

  // ─── USERINFO ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('👥 USERINFO (Empleados)');
  console.log('═'.repeat(60));

  const uCount = await req().query('SELECT COUNT(*) AS total FROM USERINFO');
  console.log(`Total empleados: ${uCount.recordset[0].total}`);

  const uSample = await req().query(`
    SELECT TOP 5 USERID, Badgenumber, Name, DefaultDeptID
    FROM USERINFO ORDER BY USERID
  `);
  console.log('\nPrimeros 5 empleados:');
  uSample.recordset.forEach(u => {
    console.log(`  ID:${u.USERID} | Badge:${u.Badgenumber} | Nombre:${u.Name} | Depto:${u.DefaultDeptID}`);
  });

  // ─── DEPARTMENTS ─────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('🏢 DEPARTMENTS');
  console.log('═'.repeat(60));

  const depts = await req().query('SELECT DEPTID, DeptName FROM DEPARTMENTS');
  depts.recordset.forEach(d => console.log(`  ID:${d.DEPTID} | ${d.DeptName}`));

  // ─── Machines ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('⌚ Machines (Relojes)');
  console.log('═'.repeat(60));

  try {
    const machines = await req().query('SELECT MachineID, MachineAlias, IPAddress, Port FROM Machines');
    machines.recordset.forEach(m => {
      console.log(`  ID:${m.MachineID} | ${m.MachineAlias} | IP:${m.IPAddress}:${m.Port}`);
    });
  } catch { console.log('  (tabla Machines no disponible)'); }

  // ─── SHIFT ──────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('🕐 SHIFT (Horarios)');
  console.log('═'.repeat(60));

  try {
    const shifts = await req().query('SELECT TOP 5 SHIFTID, ShiftName, CheckIn1, CheckOut1, Late FROM SHIFT');
    shifts.recordset.forEach(s => {
      console.log(`  ID:${s.SHIFTID} | ${s.ShiftName} | Entrada:${s.CheckIn1} | Salida:${s.CheckOut1} | Tolerancia:${s.Late}min`);
    });
  } catch { console.log('  (tabla SHIFT no disponible)'); }

  // ─── VIEW: VHorario_filtrado ──────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('👁️  Vista: VHorario_filtrado');
  console.log('═'.repeat(60));

  try {
    const view = await req().query('SELECT TOP 5 * FROM VHorario_filtrado');
    console.log('Columnas:', Object.keys(view.recordset[0] || {}).join(', '));
    view.recordset.forEach(r => console.log('  ', JSON.stringify(r).substring(0, 120)));
  } catch (e) { console.log('  Error:', e.message); }

  // ─── Resumen ─────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('✅ RESUMEN PARA EL .env\n');
  console.log(`ATT_HOST=${server.trim()}`);
  console.log(`ATT_PORT=1433`);
  console.log(`ATT_USER=${user.trim()}`);
  console.log(`ATT_PASSWORD=<tu contraseña>`);
  console.log(`ATT_DATABASE=att2000`);
  console.log('\n📌 Copia estas líneas en tu archivo .env\n');

  await pool.close();
  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
