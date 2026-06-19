/**
 * Tests del exportador bancario configurable.
 */
const { exportBatch, resolveExpression } = require('../src/services/bankExporter');

// ─── resolveExpression ───────────────────────────────────────────
describe('resolveExpression()', () => {
  const row = {
    document_number: '1234567',
    full_name: 'Pérez Juan',
    amount: 2500000,
    payment_date: '2025-05-01',
    bank_name: 'Banco Vision',
  };

  test('campo plano', () => {
    expect(resolveExpression('document_number', row)).toBe('1234567');
  });

  test('LITERAL:valor', () => {
    expect(resolveExpression('LITERAL:PAGO_SAL', row)).toBe('PAGO_SAL');
  });

  test('DATE:YYYYMMDD', () => {
    expect(resolveExpression('DATE:YYYYMMDD', row)).toBe('20250501');
  });

  test('AMOUNT:0 redondea a entero', () => {
    expect(resolveExpression('AMOUNT:0', row)).toBe('2500000');
  });

  test('AMOUNT:2 dos decimales', () => {
    expect(resolveExpression('AMOUNT:2', row)).toBe('2500000.00');
  });

  test('campo anidado (full_name)', () => {
    expect(resolveExpression('full_name', row)).toBe('Pérez Juan');
  });

  test('campo inexistente → string vacío', () => {
    expect(resolveExpression('nonexistent.field', row)).toBe('');
  });
});

// ─── exportBatch ─────────────────────────────────────────────────
const layout = { format_type: 'CSV', delimiter: ',', encoding: 'utf8', has_header: 1 };
const fields = [
  { field_name: 'doc', header_label: 'Documento', source_expression: 'document_number', field_length: null, alignment: 'LEFT' },
  { field_name: 'monto', header_label: 'Monto', source_expression: 'AMOUNT:0', field_length: null, alignment: 'LEFT' },
];
const lines = [
  { document_number: '111111', amount: 1000000 },
  { document_number: '222222', amount: 2000000 },
];

describe('exportBatch() — CSV', () => {
  test('retorna buffer con encabezado', async () => {
    const { buffer, ext, mime } = await exportBatch(layout, fields, lines);
    expect(ext).toBe('csv');
    expect(mime).toContain('text/csv');
    const text = buffer.toString();
    expect(text).toContain('Documento,Monto');
    expect(text).toContain('111111,1000000');
    expect(text).toContain('222222,2000000');
  });
});

describe('exportBatch() — TXT_FIXED', () => {
  const fixedLayout = {
    format_type: 'TXT_FIXED', encoding: 'utf8', has_header: 0,
  };
  const fixedFields = [
    { field_name: 'doc', header_label: 'Doc', source_expression: 'document_number', field_length: 10, alignment: 'LEFT', padding_char: ' ' },
    { field_name: 'monto', header_label: 'Monto', source_expression: 'AMOUNT:0', field_length: 12, alignment: 'RIGHT', padding_char: '0' },
  ];

  test('genera líneas de ancho fijo con padding correcto', async () => {
    const { buffer, ext } = await exportBatch(fixedLayout, fixedFields, lines);
    expect(ext).toBe('txt');
    const rows = buffer.toString().split('\r\n');
    expect(rows[0]).toHaveLength(22); // 10 + 12
    expect(rows[0].startsWith('111111    ')).toBe(true); // left-padded doc
    expect(rows[0].endsWith('000001000000')).toBe(true); // right-padded amount
  });
});

describe('exportBatch() — XLSX', () => {
  test('retorna buffer xlsx válido', async () => {
    const xlsxLayout = { format_type: 'XLSX', encoding: 'utf8', has_header: 1 };
    const { buffer, ext, mime } = await exportBatch(xlsxLayout, fields, lines);
    expect(ext).toBe('xlsx');
    expect(mime).toContain('spreadsheetml');
    expect(buffer.length).toBeGreaterThan(100);
  });
});

describe('exportBatch() — formato inválido', () => {
  test('lanza error', async () => {
    const badLayout = { format_type: 'PDF' };
    await expect(exportBatch(badLayout, fields, lines)).rejects.toThrow('no soportado');
  });
});
