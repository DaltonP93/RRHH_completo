/**
 * bankExporter.js
 *
 * Exportador bancario configurable por campo.
 * Soporta: CSV, TXT_FIXED (ancho fijo), TXT_DELIMITED, XLSX.
 *
 * source_expression puede referenciar campos de la fila:
 *   "employee.document_number", "line.amount", "batch.payment_date",
 *   "LITERAL:valor", "DATE:YYYYMMDD", "AMOUNT:0", "AMOUNT:2" (decimales)
 */

const ExcelJS = require('exceljs');

// ─── Expresión → valor ────────────────────────────────────────────
function resolveExpression(expr, row) {
  if (!expr) return '';

  if (expr.startsWith('LITERAL:')) return expr.slice(8);

  if (expr.startsWith('DATE:')) {
    const fmt = expr.slice(5);
    const d = row.payment_date ? new Date(row.payment_date) : new Date();
    return fmt
      .replace('YYYY', d.getFullYear())
      .replace('MM',   String(d.getMonth() + 1).padStart(2, '0'))
      .replace('DD',   String(d.getDate()).padStart(2, '0'));
  }

  if (expr.startsWith('AMOUNT:')) {
    const decimals = parseInt(expr.slice(7));
    const raw = parseFloat(row.amount || row.net_amount || 0);
    if (decimals === 0) return String(Math.round(raw));
    return raw.toFixed(decimals);
  }

  // Deep property navigation: "employee.document_number" → row["employee.document_number"] or row.employee?.document_number
  const parts = expr.split('.');
  let val = row;
  for (const part of parts) {
    val = val?.[part];
    if (val === undefined || val === null) break;
  }

  return val !== undefined && val !== null ? String(val) : '';
}

// ─── Aplicar padding según field_length ──────────────────────────
function applyPadding(val, field) {
  if (!field.field_length) return val;
  const len  = parseInt(field.field_length);
  const pad  = field.padding_char || ' ';
  const align = (field.alignment || 'LEFT').toUpperCase();

  if (val.length >= len) return val.slice(0, len);
  return align === 'RIGHT'
    ? val.padStart(len, pad)
    : val.padEnd(len, pad);
}

// ─── Construir filas de datos ─────────────────────────────────────
function buildDataRows(lines, fields) {
  return lines.map(line => {
    const row = {};
    for (const f of fields) {
      row[f.field_name] = applyPadding(resolveExpression(f.source_expression, line), f);
    }
    return row;
  });
}

// ─── Generadores por formato ──────────────────────────────────────

function generateCsv(layout, fields, lines) {
  const delimiter = layout.delimiter || ',';
  const rows = buildDataRows(lines, fields);
  const parts = [];

  if (layout.has_header) {
    parts.push(fields.map(f => f.header_label || f.field_name).join(delimiter));
  }

  for (const row of rows) {
    const cols = fields.map(f => {
      const val = row[f.field_name] || '';
      const needsQuotes = val.includes(delimiter) || val.includes('"') || val.includes('\n');
      return needsQuotes ? `"${val.replace(/"/g, '""')}"` : val;
    });
    parts.push(cols.join(delimiter));
  }

  return Buffer.from(parts.join('\n'), layout.encoding || 'utf8');
}

function generateTxtFixed(layout, fields, lines) {
  const rows = buildDataRows(lines, fields);
  const parts = [];

  if (layout.has_header) {
    const header = fields.map(f => applyPadding(f.header_label || f.field_name, f)).join('');
    parts.push(header);
  }

  for (const row of rows) {
    parts.push(fields.map(f => row[f.field_name] || '').join(''));
  }

  return Buffer.from(parts.join('\r\n'), layout.encoding || 'utf8');
}

function generateTxtDelimited(layout, fields, lines) {
  return generateCsv(layout, fields, lines);
}

async function generateXlsx(layout, fields, lines) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SisHoras';
  wb.created = new Date();

  const ws = wb.addWorksheet('Pagos');

  if (layout.has_header) {
    ws.addRow(fields.map(f => f.header_label || f.field_name));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }

  const rows = buildDataRows(lines, fields);
  for (const row of rows) {
    ws.addRow(fields.map(f => row[f.field_name] || ''));
  }

  ws.columns.forEach(col => { col.width = 18; });

  return wb.xlsx.writeBuffer();
}

// ─── API principal ────────────────────────────────────────────────
async function exportBatch(layout, fields, lines) {
  const fmt = (layout.format_type || 'CSV').toUpperCase();

  switch (fmt) {
    case 'CSV':
      return { buffer: generateCsv(layout, fields, lines), ext: 'csv', mime: 'text/csv' };

    case 'TXT_FIXED':
      return { buffer: generateTxtFixed(layout, fields, lines), ext: 'txt', mime: 'text/plain' };

    case 'TXT_DELIMITED':
      return { buffer: generateTxtDelimited(layout, fields, lines), ext: 'txt', mime: 'text/plain' };

    case 'XLSX':
      return { buffer: await generateXlsx(layout, fields, lines), ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

    default:
      throw new Error(`Formato de exportación no soportado: ${fmt}`);
  }
}

module.exports = { exportBatch, resolveExpression };
