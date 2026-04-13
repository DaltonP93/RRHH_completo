/**
 * test-connection.js
 * Prueba rápida de conexión a MySQL.
 * Lee las variables del .env automáticamente.
 *
 * Uso:
 *   node scripts/test-connection.js
 */

require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

async function test() {
  console.log('\n🔌 Probando conexión a MySQL...\n');
  console.log(`   Host: ${process.env.DB_HOST}`);
  console.log(`   Puerto: ${process.env.DB_PORT || 3306}`);
  console.log(`   Base de datos: ${process.env.DB_NAME}`);
  console.log(`   Usuario: ${process.env.DB_USER}\n`);

  try {
    const conn = await mysql.createConnection({
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT || 3306,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const [rows] = await conn.query('SHOW TABLES');
    console.log(`✅ Conexión exitosa! Tablas encontradas: ${rows.length}`);

    const [version] = await conn.query('SELECT VERSION() AS v');
    console.log(`   MySQL versión: ${version[0].v}`);

    await conn.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n💡 Revisa los datos en el archivo .env');
  }
}

test();
