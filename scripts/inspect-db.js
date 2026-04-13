/**
 * inspect-db.js
 * Inspecciona la base de datos del ZK Attendance Management
 * y genera un reporte de tablas, columnas y datos de ejemplo.
 *
 * Uso:
 *   npm install mysql2   (solo la primera vez)
 *   node scripts/inspect-db.js
 */

const mysql = require('mysql2/promise');
const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n🔍 Inspector de Base de Datos — ZK Attendance Management\n');
  console.log('Este script analiza tus tablas MySQL sin modificar nada.\n');

  // Pedir credenciales
  const host     = await ask('Host MySQL (ej: localhost o 192.168.1.100): ');
  const port     = await ask('Puerto (Enter = 3306): ') || '3306';
  const user     = await ask('Usuario MySQL: ');
  const password = await ask('Contraseña: ');
  const database = await ask('Nombre de la base de datos: ');

  console.log('\n⏳ Conectando...\n');

  let conn;
  try {
    conn = await mysql.createConnection({
      host: host.trim(),
      port: parseInt(port),
      user: user.trim(),
      password: password.trim(),
      database: database.trim(),
    });
    console.log('✅ Conexión exitosa!\n');
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    console.log('\nVerifica que:');
    console.log('  - El host y puerto sean correctos');
    console.log('  - El usuario tenga permisos de lectura');
    console.log('  - El MySQL permita conexiones externas (si es red)');
    rl.close();
    return;
  }

  // Obtener todas las tablas
  const [tables] = await conn.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];
  const tableNames = tables.map(t => t[tableKey]);

  console.log(`📋 Tablas encontradas (${tableNames.length} total):\n`);
  tableNames.forEach(t => console.log(`  • ${t}`));

  // Analizar cada tabla
  const schema = {};
  const preview = {};

  for (const table of tableNames) {
    const [cols] = await conn.query(`DESCRIBE \`${table}\``);
    schema[table] = cols.map(c => ({
      field: c.Field,
      type:  c.Type,
      null:  c.Null,
      key:   c.Key,
      default: c.Default,
    }));

    // 3 filas de ejemplo
    try {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\` LIMIT 3`);
      preview[table] = rows;
    } catch {
      preview[table] = [];
    }
  }

  // Guardar reporte JSON
  const report = {
    host: host.trim(),
    database: database.trim(),
    inspectedAt: new Date().toISOString(),
    totalTables: tableNames.length,
    schema,
    preview
  };

  const outputFile = 'db-schema.json';
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

  // Mostrar resumen en pantalla
  console.log('\n\n📊 RESUMEN DE TABLAS IMPORTANTES:\n');
  console.log('='.repeat(60));

  // Buscar tablas relacionadas a asistencia
  const attendanceKeywords = ['check', 'attend', 'marcad', 'user', 'employ', 'person', 'dept', 'shift', 'trans', 'log', 'clock'];
  const relevantTables = tableNames.filter(t =>
    attendanceKeywords.some(kw => t.toLowerCase().includes(kw))
  );

  if (relevantTables.length) {
    console.log('\n🎯 Tablas probablemente relacionadas a asistencia:\n');
    for (const table of relevantTables) {
      const cols = schema[table];
      console.log(`\n📁 ${table} (${cols.length} columnas)`);
      cols.forEach(c => {
        console.log(`   ${c.field.padEnd(25)} ${c.type.padEnd(20)} ${c.key ? '[' + c.key + ']' : ''}`);
      });

      if (preview[table]?.length) {
        console.log(`   → Ejemplo de dato:`);
        console.log('  ', JSON.stringify(preview[table][0]).substring(0, 120) + '...');
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Reporte completo guardado en: ${outputFile}`);
  console.log('\n📌 PRÓXIMO PASO:');
  console.log('   Comparte el archivo db-schema.json para adaptar el nuevo sistema');
  console.log('   a tu estructura de base de datos existente.\n');

  await conn.end();
  rl.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
