-- 055_bank_exporter_layouts.sql
-- Mejoras al exportador bancario configurable + layouts precargados para bancos PY

-- ─── 1. Ampliar bank_file_layout_fields ──────────────────────────
ALTER TABLE bank_file_layout_fields
  ADD COLUMN IF NOT EXISTS position       INT NOT NULL DEFAULT 0 COMMENT 'Alias de field_order para compat.',
  ADD COLUMN IF NOT EXISTS format_mask    VARCHAR(100) NULL COMMENT 'Máscara de formato: AMOUNT:0, DATE:YYYYMMDD, etc.',
  MODIFY COLUMN field_order INT NOT NULL DEFAULT 0;

-- Sincronizar position con field_order donde esté en 0
UPDATE bank_file_layout_fields SET position = field_order WHERE position = 0;

-- ─── 2. Ampliar payment_batch_lines ──────────────────────────────
ALTER TABLE payment_batch_lines
  ADD COLUMN IF NOT EXISTS concept  VARCHAR(255) NULL AFTER amount,
  ADD COLUMN IF NOT EXISTS reference VARCHAR(100) NULL AFTER concept;

-- ─── 3. Layouts por defecto para bancos comunes de Paraguay ──────
-- Requiere que los bancos existan en la tabla banks.
-- Se insertan layouts genéricos que el admin puede personalizar.

-- Layout genérico CSV (sin banco específico — para cualquier banco)
INSERT IGNORE INTO bank_file_layouts
  (bank_id, name, format_type, delimiter, encoding, has_header, active, version)
SELECT b.id, 'CSV Genérico', 'CSV', ',', 'UTF-8', 1, 1, '1.0'
FROM banks b WHERE b.code = 'GENERICO' LIMIT 1;

-- Layout TXT ancho fijo — formato VISION Banco
INSERT IGNORE INTO bank_file_layouts
  (bank_id, name, format_type, delimiter, encoding, has_header, active, version)
SELECT b.id, 'TXT Fijo — VISION', 'TXT_FIXED', '', 'UTF-8', 0, 1, '1.0'
FROM banks b WHERE b.code IN ('VISION','BANCOVISION') LIMIT 1;

-- Layout XLSX genérico
INSERT IGNORE INTO bank_file_layouts
  (bank_id, name, format_type, delimiter, encoding, has_header, active, version)
SELECT b.id, 'Excel (XLSX) Genérico', 'XLSX', '', 'UTF-8', 1, 1, '1.0'
FROM banks b WHERE b.code = 'GENERICO' LIMIT 1;

-- ─── 4. Campos por defecto para el layout CSV genérico ───────────
-- Solo si el layout existe y no tiene campos
INSERT INTO bank_file_layout_fields
  (layout_id, field_order, position, field_name, header_label, source_expression, field_length, alignment)
SELECT l.id, f.ord, f.ord, f.fname, f.hlabel, f.sexpr, f.flen, 'LEFT'
FROM bank_file_layouts l
CROSS JOIN (
  SELECT 1 AS ord, 'documento'   AS fname, 'Documento'        AS hlabel, 'document_number'      AS sexpr, 20  AS flen UNION ALL
  SELECT 2,        'nombre',              'Nombre Completo',              'full_name',                       60       UNION ALL
  SELECT 3,        'banco',               'Banco',                        'bank_name',                       30       UNION ALL
  SELECT 4,        'cuenta',              'Nro. Cuenta',                  'bank_account_number',             20       UNION ALL
  SELECT 5,        'tipo_cuenta',         'Tipo Cuenta',                  'account_type',                    10       UNION ALL
  SELECT 6,        'monto',               'Monto (Gs.)',                  'AMOUNT:0',                        14       UNION ALL
  SELECT 7,        'concepto',            'Concepto',                     'concept',                         50       UNION ALL
  SELECT 8,        'fecha_pago',          'Fecha Pago',                   'DATE:YYYYMMDD',                   8
) AS f
WHERE l.name = 'CSV Genérico' AND l.format_type = 'CSV'
  AND NOT EXISTS (SELECT 1 FROM bank_file_layout_fields x WHERE x.layout_id = l.id);

-- ─── 5. Campos para layout XLSX genérico ─────────────────────────
INSERT INTO bank_file_layout_fields
  (layout_id, field_order, position, field_name, header_label, source_expression, field_length, alignment)
SELECT l.id, f.ord, f.ord, f.fname, f.hlabel, f.sexpr, f.flen, 'LEFT'
FROM bank_file_layouts l
CROSS JOIN (
  SELECT 1 AS ord, 'cedula'      AS fname, 'C.I.'             AS hlabel, 'document_number'      AS sexpr, NULL AS flen UNION ALL
  SELECT 2,        'apellidos',           'Apellidos',                   'last_name',                       NULL      UNION ALL
  SELECT 3,        'nombres',             'Nombres',                     'first_name',                      NULL      UNION ALL
  SELECT 4,        'banco',               'Banco',                       'bank_name',                       NULL      UNION ALL
  SELECT 5,        'cuenta',              'Cuenta',                      'bank_account_number',             NULL      UNION ALL
  SELECT 6,        'monto',               'Monto',                       'AMOUNT:0',                        NULL      UNION ALL
  SELECT 7,        'referencia',          'Referencia',                  'reference',                       NULL
) AS f
WHERE l.name = 'Excel (XLSX) Genérico' AND l.format_type = 'XLSX'
  AND NOT EXISTS (SELECT 1 FROM bank_file_layout_fields x WHERE x.layout_id = l.id);
