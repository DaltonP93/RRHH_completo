/**
 * find-missing-names.js
 * Diagnóstico + export de empleados sin nombre.
 *
 * Para cada empleado en MySQL con first_name='' AND last_name='':
 *   1. Lee la fila COMPLETA de att2000.USERINFO (todas las columnas).
 *   2. Muestra qué columnas tienen datos no-vacíos (para detectar si hay
 *      otra columna con el nombre real, ej. SSN, Comment, LASTNAME, OPHONE).
 *   3. Exporta CSV `empleados-sin-nombre.csv` listo para completar a mano
 *      e importar desde la UI.
 *
 * Uso:
 *   cd /var/www/html/Gestion_Horas
 *   node scripts/find-missing-names.js
 *
 * Lee credenciales de api/.env (ATT_HOST, ATT_USER, etc. + MySQL).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../api/.env') });
const sql   = require('mssql');
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

async function main() {
  // ─── MySQL: lista de códigos sin nombre ─────────────────────────
  const my = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'sishoras',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME     || 'asistencia',
  });

  const [rows] = await my.query(`
    SELECT id, code, employee_number
    FROM employees
    WHERE (first_name IS NULL OR first_name = '')
      AND (last_name  IS NULL OR last_name  = '')
    ORDER BY CAST(code AS UNSIGNED)
  `);
  console.log(`📊 Empleados sin nombre en MySQL: ${rows.length}\n`);

  if (rows.length === 0) { await my.end(); return; }

  // ─── SQL Server: leer USERINFO completa ─────────────────────────
  const pool = await new sql.ConnectionPool({
    server:   process.env.ATT_HOST     || 'ADVENTISTA',
    port:     parseInt(process.env.ATT_PORT || '1433'),
    user:     process.env.ATT_USER     || 'sa',
    password: process.env.ATT_PASSWORD ?? '',
    database: process.env.ATT_DATABASE || 'att2000',
    options:  { encrypt: false, trustServerCertificate: true },
  }).connect();

  // Descubrir columnas reales de USERINFO
  const colsResult = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'USERINFO'
  `);
  const allCols = colsResult.recordset.map(c => c.COLUMN_NAME);
  console.log(`📋 Columnas en USERINFO (${allCols.length}): ${allCols.join(', ')}\n`);

  // Trae TODAS las columnas para los códigos sin nombre
  const codes = rows.map(r => parseInt(r.code)).filter(n => Number.isFinite(n));
  if (codes.length === 0) { await pool.close(); await my.end(); return; }

  // Chunk en grupos de 500 para evitar queries gigantes
  const chunks = [];
  for (let i = 0; i < codes.length; i += 500) chunks.push(codes.slice(i, i + 500));

  const userRows = [];
  for (const chunk of chunks) {
    const r = await pool.request().query(`
      SELECT * FROM USERINFO WHERE USERID IN (${chunk.join(',')})
    `);
    userRows.push(...r.recordset);
  }
  console.log(`✅ Filas recuperadas de att2000.USERINFO: ${userRows.length}\n`);

  // ─── Análisis: qué columnas tienen datos útiles ────────────────
  console.log('═'.repeat(70));
  console.log('📊 ANÁLISIS POR COLUMNA (empleados sin nombre en MySQL)');
  console.log('═'.repeat(70));
  console.log('Columna              | NoVacíos | ConLetras | Muestra');
  console.log('-'.repeat(70));

  for (const col of allCols) {
    let noVacios = 0, conLetras = 0;
    const muestras = new Set();
    for (const u of userRows) {
      const v = u[col];
      if (v === null || v === undefined || v === '') continue;
      noVacios++;
      const s = String(v).trim();
      if (/\p{L}/u.test(s)) {
        conLetras++;
        if (muestras.size < 3) muestras.add(s.slice(0, 25));
      }
    }
    if (noVacios > 0) {
      console.log(
        `${col.padEnd(20)} | ${String(noVacios).padStart(8)} | ${String(conLetras).padStart(9)} | ${[...muestras].join(' · ')}`
      );
    }
  }

  // ─── Export CSV para completar a mano ──────────────────────────
  const outPath = path.resolve(__dirname, 'empleados-sin-nombre.csv');
  const header  = 'Código,Legajo,Nombre,Apellido\n';
  const lines   = rows.map(r => `${r.code},${r.employee_number || ''},,`).join('\n');
  fs.writeFileSync(outPath, '\uFEFF' + header + lines, 'utf8');

  console.log('\n' + '═'.repeat(70));
  console.log(`💾 CSV exportado: ${outPath}`);
  console.log(`   ${rows.length} filas listas para completar a mano.`);
  console.log('   Importalo desde /empleados → botón "Importar" con');
  console.log('   "Actualizar empleados existentes (mismo código)" tildado.');
  console.log('═'.repeat(70) + '\n');

  await pool.close();
  await my.end();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
