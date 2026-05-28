#!/usr/bin/env node
/**
 * verify-checktime-import.js
 * Verifica que la conversión de CHECKTIME (SQL Server) → attendance_logs.timestamp
 * no introduce desfase horario.
 *
 * Uso:
 *   node scripts/verify-checktime-import.js
 *   node scripts/verify-checktime-import.js --date 2026-05-28
 *   node scripts/verify-checktime-import.js --date 2026-05-28 --employee "Martinez"
 *
 * Requiere que la API esté corriendo (BASE_URL) y que TOKEN sea válido,
 * o usa las variables de entorno DB_* y ATT_* directamente.
 *
 * Salida esperada después de la corrección:
 *   ✅ PASS  all_same_offset = 0 (sin desfase)
 */

const API_DIR = require('path').join(__dirname, '../api');
try { require('dotenv').config({ path: require('path').join(API_DIR, '.env') }); } catch {}

// ── 1. Unit test de checktimeToStr (no requiere red) ────────────────────────
function unitTest() {
  const { checktimeToStr } = require(require('path').join(API_DIR, 'src/config/zkAdapter'));

  const cases = [
    // tedious devuelve new Date donde UTC == valor raw de SQL Server
    {
      input:    new Date('2026-05-28T15:11:05.000Z'),
      expected: '2026-05-28 15:11:05',
      label:    'Date UTC → string sin offset',
    },
    {
      input:    new Date('2026-05-28T06:45:11.000Z'),
      expected: '2026-05-28 06:45:11',
      label:    'Entrada mañana → sin offset',
    },
    {
      input:    '2026-05-28T15:11:05.000Z',
      expected: '2026-05-28 15:11:05',
      label:    'String ISO → sin offset',
    },
    {
      input:    '2026-05-28 15:11:05',
      expected: '2026-05-28 15:11:05',
      label:    'String MySQL ya correcto → sin cambio',
    },
  ];

  let pass = 0, fail = 0;
  console.log('\n=== Unit tests: checktimeToStr ===\n');
  for (const c of cases) {
    const result = checktimeToStr(c.input);
    const ok = result === c.expected;
    console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${c.label}`);
    if (!ok) console.log(`       expected: ${c.expected}\n       got:      ${result}`);
    ok ? pass++ : fail++;
  }
  console.log(`\nResultado unit tests: ${pass} PASS | ${fail} FAIL\n`);
  return fail === 0;
}

// ── 2. Verificación de staging via punch-time-audit ──────────────────────────
async function stagingCheck() {
  const args = process.argv.slice(2);
  const dateIdx  = args.indexOf('--date');
  const empIdx   = args.indexOf('--employee');
  const baseIdx  = args.indexOf('--base');
  const tokenIdx = args.indexOf('--token');

  const date     = dateIdx  >= 0 ? args[dateIdx  + 1] : new Date().toISOString().split('T')[0];
  const employee = empIdx   >= 0 ? args[empIdx   + 1] : '';
  const base     = baseIdx  >= 0 ? args[baseIdx  + 1] : (process.env.BASE_URL || 'http://localhost');
  const token    = tokenIdx >= 0 ? args[tokenIdx + 1] : (process.env.TOKEN || '');

  if (!token) {
    console.log('⚠️  TOKEN no provisto — saltando verificación de staging.');
    console.log('   Usar: node scripts/verify-checktime-import.js --token <JWT> [--date YYYY-MM-DD] [--employee nombre]');
    return true;
  }

  const url = `${base}/api/attendance/punch-time-audit?date=${date}${employee ? `&employee=${encodeURIComponent(employee)}` : ''}`;
  console.log(`=== Staging check: ${url} ===\n`);

  try {
    const https = url.startsWith('https') ? require('https') : require('http');
    const data = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { reject(new Error('Respuesta no es JSON')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });

    if (!data.ok) {
      console.log('❌ Endpoint retornó ok=false:', data.error || data);
      return false;
    }

    const summary = data.offset_summary;
    if (!summary) {
      console.log('⚠️  Sin registros emparejados para la fecha indicada.');
      console.log('   Verifique que att2000 tiene datos para', date);
      return true;
    }

    console.log(`Registros comparados: ${summary.count}`);
    console.log(`Desfase mín/máx/avg:  ${summary.min_diff_minutes} / ${summary.max_diff_minutes} / ${summary.avg_diff_minutes} min`);
    console.log(`Desfase uniforme:      ${summary.all_same_offset !== null ? summary.all_same_offset + ' min' : 'variable'}`);
    console.log();

    if (summary.all_same_offset === 0) {
      console.log('✅ PASS  diff_minutes = 0 — timestamps correctos, sin desfase');
      return true;
    } else if (summary.all_same_offset === -180) {
      console.log('❌ FAIL  diff_minutes = -180 — bug de conversión ACTIVO');
      console.log('   Verificar que el código con checktimeToStr está deployado y la API reiniciada.');
      return false;
    } else {
      console.log(`⚠️  diff_minutes = ${summary.all_same_offset} — desfase inesperado, investigar manualmente`);
      if (data.records?.length) {
        console.log('\nPrimeros registros:');
        data.records.slice(0, 3).forEach(r => {
          console.log(`  ${r.employee_name}: att2000=${r.att2000?.raw_checktime} local=${r.local?.attendance_logs_timestamp} diff=${r.diff_minutes}m`);
        });
      }
      return false;
    }
  } catch (err) {
    console.log('❌ Error conectando al staging:', err.message);
    return false;
  }
}

(async () => {
  const unitOk    = unitTest();
  const stagingOk = await stagingCheck();

  console.log('\n=== Resumen ===');
  console.log(`Unit tests:      ${unitOk    ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Staging audit:   ${stagingOk ? '✅ PASS' : '❌ FAIL'}`);

  process.exit(unitOk && stagingOk ? 0 : 1);
})();
