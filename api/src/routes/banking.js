/**
 * banking.js — Banks, bank file layouts, payment batches.
 *
 * Routes:
 *   GET/POST              /api/banks
 *   PUT                   /api/banks/:id
 *   GET/POST              /api/bank-file-layouts
 *   GET/POST              /api/bank-file-layouts/:id/fields
 *   PUT/DELETE            /api/bank-file-layout-fields/:id
 *   GET/POST              /api/payment-batches
 *   GET                   /api/payment-batches/:id
 *   POST                  /api/payment-batches/:id/generate-from-payroll
 *   POST                  /api/payment-batches/:id/validate
 *   POST                  /api/payment-batches/:id/approve
 *   GET                   /api/payment-batches/:id/export-csv
 *   PUT                   /api/payment-batch-lines/:id
 *   POST                  /api/payment-batch-lines/:id/status
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Banks ───────────────────────────────────────────────────────────────────

// GET /api/banks
router.get('/banks', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT * FROM banks WHERE status != 'deleted' ORDER BY name ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/banks error:', err);
    res.status(500).json({ error: 'Error al obtener bancos' });
  }
});

// POST /api/banks
router.post('/banks', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, swift_code, country, website, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO banks (name, code, swift_code, country, website, notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [name, code || null, swift_code || null, country || 'PY', website || null, notes || null] });

    const [row] = await sequelize.query('SELECT * FROM banks WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/banks error:', err);
    res.status(500).json({ error: 'Error al crear banco' });
  }
});

// PUT /api/banks/:id
router.put('/banks/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, swift_code, country, website, notes, status } = req.body;

    await sequelize.query(`
      UPDATE banks SET
        name        = COALESCE(?, name),
        code        = COALESCE(?, code),
        swift_code  = COALESCE(?, swift_code),
        country     = COALESCE(?, country),
        website     = COALESCE(?, website),
        notes       = COALESCE(?, notes),
        status      = COALESCE(?, status),
        updated_at  = NOW()
      WHERE id = ?
    `, { replacements: [name || null, code || null, swift_code || null, country || null, website || null, notes || null, status || null, req.params.id] });

    const [row] = await sequelize.query('SELECT * FROM banks WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Banco no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/banks/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar banco' });
  }
});

// ─── Bank File Layouts ───────────────────────────────────────────────────────

// GET /api/bank-file-layouts
router.get('/bank-file-layouts', async (req, res) => {
  try {
    const { bank_id } = req.query;
    let sql = `
      SELECT bfl.*, b.name AS bank_name
      FROM bank_file_layouts bfl
      LEFT JOIN banks b ON b.id = bfl.bank_id
      WHERE bfl.status != 'deleted'
    `;
    const replacements = [];
    if (bank_id) { sql += ' AND bfl.bank_id = ?'; replacements.push(bank_id); }
    sql += ' ORDER BY b.name ASC, bfl.name ASC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/bank-file-layouts error:', err);
    res.status(500).json({ error: 'Error al obtener layouts de archivo bancario' });
  }
});

// POST /api/bank-file-layouts
router.post('/bank-file-layouts', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { bank_id, name, code, file_format, delimiter, encoding, description } = req.body;
    if (!bank_id || !name) {
      return res.status(400).json({ error: 'bank_id y name son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO bank_file_layouts
        (bank_id, name, code, file_format, delimiter, encoding, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [
      bank_id, name, code || null, file_format || 'CSV',
      delimiter || ',', encoding || 'UTF-8', description || null
    ]});

    const [row] = await sequelize.query('SELECT * FROM bank_file_layouts WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/bank-file-layouts error:', err);
    res.status(500).json({ error: 'Error al crear layout bancario' });
  }
});

// GET /api/bank-file-layouts/:id/fields
router.get('/bank-file-layouts/:id/fields', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT * FROM bank_file_layout_fields WHERE layout_id = ? ORDER BY position ASC',
      { replacements: [req.params.id] }
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/bank-file-layouts/:id/fields error:', err);
    res.status(500).json({ error: 'Error al obtener campos del layout' });
  }
});

// POST /api/bank-file-layouts/:id/fields
router.post('/bank-file-layouts/:id/fields', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { field_name, field_key, position, length, format, default_value, required } = req.body;
    if (!field_name || !field_key) {
      return res.status(400).json({ error: 'field_name y field_key son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO bank_file_layout_fields
        (layout_id, field_name, field_key, position, length, format, default_value, required, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, { replacements: [
      req.params.id, field_name, field_key, position || 0, length || null,
      format || null, default_value || null, required ? 1 : 0
    ]});

    const [row] = await sequelize.query('SELECT * FROM bank_file_layout_fields WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/bank-file-layouts/:id/fields error:', err);
    res.status(500).json({ error: 'Error al agregar campo al layout' });
  }
});

// PUT /api/bank-file-layout-fields/:id
router.put('/bank-file-layout-fields/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { field_name, field_key, position, length, format, default_value, required } = req.body;

    await sequelize.query(`
      UPDATE bank_file_layout_fields SET
        field_name    = COALESCE(?, field_name),
        field_key     = COALESCE(?, field_key),
        position      = COALESCE(?, position),
        length        = COALESCE(?, length),
        format        = COALESCE(?, format),
        default_value = COALESCE(?, default_value),
        required      = COALESCE(?, required),
        updated_at    = NOW()
      WHERE id = ?
    `, { replacements: [
      field_name || null, field_key || null, position ?? null, length ?? null,
      format || null, default_value || null, required != null ? (required ? 1 : 0) : null,
      req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM bank_file_layout_fields WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Campo no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/bank-file-layout-fields/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar campo del layout' });
  }
});

// DELETE /api/bank-file-layout-fields/:id
router.delete('/bank-file-layout-fields/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    await sequelize.query(
      'DELETE FROM bank_file_layout_fields WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Campo eliminado correctamente' });
  } catch (err) {
    console.error('DELETE /api/bank-file-layout-fields/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar campo del layout' });
  }
});

// ─── Payment Batches ─────────────────────────────────────────────────────────

// GET /api/payment-batches
router.get('/payment-batches', async (req, res) => {
  try {
    const { company_id, status, year, month } = req.query;
    let sql = `
      SELECT pb.*,
             c.legal_name AS company_name,
             b.name AS bank_name,
             COUNT(pbl.id) AS line_count
      FROM payment_batches pb
      LEFT JOIN companies c ON c.id = pb.company_id
      LEFT JOIN banks b ON b.id = pb.bank_id
      LEFT JOIN payment_batch_lines pbl ON pbl.payment_batch_id = pb.id
      WHERE 1=1
    `;
    const replacements = [];
    if (company_id) { sql += ' AND pb.company_id = ?';    replacements.push(company_id); }
    if (status)     { sql += ' AND pb.status = ?';         replacements.push(status); }
    if (year)       { sql += ' AND YEAR(pb.batch_date) = ?'; replacements.push(year); }
    if (month)      { sql += ' AND MONTH(pb.batch_date) = ?'; replacements.push(month); }
    sql += ' GROUP BY pb.id ORDER BY pb.batch_date DESC, pb.created_at DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/payment-batches error:', err);
    res.status(500).json({ error: 'Error al obtener lotes de pago' });
  }
});

// POST /api/payment-batches
router.post('/payment-batches', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { company_id, bank_id, batch_date, description, payment_type, payroll_run_id } = req.body;
    if (!company_id || !bank_id || !batch_date) {
      return res.status(400).json({ error: 'company_id, bank_id y batch_date son requeridos' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO payment_batches
        (company_id, bank_id, batch_date, description, payment_type,
         payroll_run_id, status, total_amount, total_records, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', 0, 0, ?, NOW(), NOW())
    `, { replacements: [
      company_id, bank_id, batch_date, description || null,
      payment_type || 'SALARY', payroll_run_id || null, req.user.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM payment_batches WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/payment-batches error:', err);
    res.status(500).json({ error: 'Error al crear lote de pago' });
  }
});

// GET /api/payment-batches/:id
router.get('/payment-batches/:id', async (req, res) => {
  try {
    const [batches] = await sequelize.query(`
      SELECT pb.*,
             c.legal_name AS company_name,
             b.name AS bank_name
      FROM payment_batches pb
      LEFT JOIN companies c ON c.id = pb.company_id
      LEFT JOIN banks b ON b.id = pb.bank_id
      WHERE pb.id = ?
    `, { replacements: [req.params.id] });

    if (!batches.length) return res.status(404).json({ error: 'Lote de pago no encontrado' });

    const [lines] = await sequelize.query(`
      SELECT pbl.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.code AS employee_code,
             b.name AS bank_name
      FROM payment_batch_lines pbl
      JOIN employees e ON e.id = pbl.employee_id
      LEFT JOIN banks b ON b.id = pbl.bank_id
      WHERE pbl.payment_batch_id = ?
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [req.params.id] });

    res.json({ ...batches[0], lines });
  } catch (err) {
    console.error('GET /api/payment-batches/:id error:', err);
    res.status(500).json({ error: 'Error al obtener lote de pago' });
  }
});

// POST /api/payment-batches/:id/generate-from-payroll
router.post('/payment-batches/:id/generate-from-payroll', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { payroll_run_id } = req.body;
    if (!payroll_run_id) {
      return res.status(400).json({ error: 'payroll_run_id es requerido' });
    }

    const [batches] = await sequelize.query(
      'SELECT * FROM payment_batches WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!batches.length) return res.status(404).json({ error: 'Lote de pago no encontrado' });
    if (!['draft', 'pending'].includes(batches[0].status)) {
      return res.status(400).json({ error: 'Solo se pueden poblar lotes en estado borrador o pendiente' });
    }

    // Get approved settlements from payroll run
    const [settlements] = await sequelize.query(`
      SELECT es.*,
             e.document_number, e.first_name, e.last_name,
             b.name AS bank_name
      FROM employee_settlements es
      JOIN employees e ON e.id = es.employee_id
      LEFT JOIN banks b ON b.id = es.bank_id
      WHERE es.payroll_run_id = ?
        AND es.status IN ('calculated', 'adjusted', 'approved')
        AND es.bank_account_number IS NOT NULL
        AND es.bank_account_number != ''
    `, { replacements: [payroll_run_id] });

    // Delete existing lines for this batch if regenerating
    await sequelize.query(
      'DELETE FROM payment_batch_lines WHERE payment_batch_id = ?',
      { replacements: [req.params.id] }
    );

    let totalAmount = 0;
    for (const settlement of settlements) {
      await sequelize.query(`
        INSERT INTO payment_batch_lines
          (payment_batch_id, employee_id, employee_settlement_id,
           bank_id, bank_account_number, bank_account_type,
           amount, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())
      `, { replacements: [
        req.params.id, settlement.employee_id, settlement.id,
        settlement.bank_id || null, settlement.bank_account_number || null,
        settlement.bank_account_type || null, settlement.net_pay || 0
      ]});
      totalAmount += parseFloat(settlement.net_pay || 0);
    }

    // Update batch totals
    await sequelize.query(`
      UPDATE payment_batches
      SET total_amount = ?, total_records = ?, payroll_run_id = ?, updated_at = NOW()
      WHERE id = ?
    `, { replacements: [
      parseFloat(totalAmount.toFixed(2)), settlements.length,
      payroll_run_id, req.params.id
    ]});

    const [updated] = await sequelize.query('SELECT * FROM payment_batches WHERE id = ?', { replacements: [req.params.id] });
    res.json({ batch: updated[0], lines_created: settlements.length, total_amount: totalAmount });
  } catch (err) {
    console.error('POST /api/payment-batches/:id/generate-from-payroll error:', err);
    res.status(500).json({ error: 'Error al generar lote desde nómina' });
  }
});

// POST /api/payment-batches/:id/validate
router.post('/payment-batches/:id/validate', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [batches] = await sequelize.query(
      'SELECT * FROM payment_batches WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!batches.length) return res.status(404).json({ error: 'Lote de pago no encontrado' });

    const [lines] = await sequelize.query(`
      SELECT pbl.*,
             e.status AS employee_status,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name
      FROM payment_batch_lines pbl
      JOIN employees e ON e.id = pbl.employee_id
      WHERE pbl.payment_batch_id = ?
    `, { replacements: [req.params.id] });

    const errors = [];
    const warnings = [];

    for (const line of lines) {
      if (!line.bank_account_number) {
        errors.push({ employee: line.employee_name, issue: 'Sin número de cuenta bancaria' });
      }
      if (!line.amount || parseFloat(line.amount) <= 0) {
        errors.push({ employee: line.employee_name, issue: 'Monto inválido o cero' });
      }
      if (line.employee_status !== 'active') {
        warnings.push({ employee: line.employee_name, issue: `Empleado en estado '${line.employee_status}'` });
      }
    }

    const isValid = errors.length === 0;

    // Update batch status based on validation
    if (isValid) {
      await sequelize.query(
        "UPDATE payment_batches SET status = 'validated', updated_at = NOW() WHERE id = ?",
        { replacements: [req.params.id] }
      );
    }

    res.json({
      valid: isValid,
      total_lines: lines.length,
      errors,
      warnings
    });
  } catch (err) {
    console.error('POST /api/payment-batches/:id/validate error:', err);
    res.status(500).json({ error: 'Error al validar lote de pago' });
  }
});

// POST /api/payment-batches/:id/approve
router.post('/payment-batches/:id/approve', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const [batches] = await sequelize.query(
      'SELECT * FROM payment_batches WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!batches.length) return res.status(404).json({ error: 'Lote de pago no encontrado' });
    if (!['validated', 'pending'].includes(batches[0].status)) {
      return res.status(400).json({ error: 'Solo se pueden aprobar lotes validados o pendientes' });
    }

    await sequelize.query(`
      UPDATE payment_batches
      SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, req.params.id] });

    const [updated] = await sequelize.query('SELECT * FROM payment_batches WHERE id = ?', { replacements: [req.params.id] });
    res.json(updated[0]);
  } catch (err) {
    console.error('POST /api/payment-batches/:id/approve error:', err);
    res.status(500).json({ error: 'Error al aprobar lote de pago' });
  }
});

// GET /api/payment-batches/:id/export-csv
router.get('/payment-batches/:id/export-csv', async (req, res) => {
  try {
    const [batches] = await sequelize.query(
      'SELECT * FROM payment_batches WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!batches.length) return res.status(404).json({ error: 'Lote de pago no encontrado' });
    const batch = batches[0];

    const [lines] = await sequelize.query(`
      SELECT
        e.document_number AS documento,
        CONCAT(e.last_name, ' ', e.first_name) AS nombre,
        b.name AS banco,
        pbl.bank_account_number AS cuenta,
        pbl.bank_account_type AS tipo_cuenta,
        pbl.amount AS monto,
        pb.description AS concepto
      FROM payment_batch_lines pbl
      JOIN employees e ON e.id = pbl.employee_id
      LEFT JOIN banks b ON b.id = pbl.bank_id
      JOIN payment_batches pb ON pb.id = pbl.payment_batch_id
      WHERE pbl.payment_batch_id = ? AND pbl.status != 'rejected'
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [req.params.id] });

    const header = 'documento,nombre,banco,cuenta,tipo_cuenta,monto,concepto\n';
    const csvRows = lines.map(r =>
      [
        r.documento || '',
        `"${(r.nombre || '').replace(/"/g, '""')}"`,
        `"${(r.banco || '').replace(/"/g, '""')}"`,
        r.cuenta || '',
        r.tipo_cuenta || '',
        r.monto || 0,
        `"${(r.concepto || '').replace(/"/g, '""')}"`
      ].join(',')
    );
    const csv = header + csvRows.join('\n');

    const dateStr = new Date(batch.batch_date || Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=pago_salarios_${dateStr}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('GET /api/payment-batches/:id/export-csv error:', err);
    res.status(500).json({ error: 'Error al exportar lote de pago' });
  }
});

// ─── Payment Batch Lines ─────────────────────────────────────────────────────

// PUT /api/payment-batch-lines/:id
router.put('/payment-batch-lines/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { bank_id, bank_account_number, bank_account_type, amount, notes } = req.body;

    await sequelize.query(`
      UPDATE payment_batch_lines SET
        bank_id             = COALESCE(?, bank_id),
        bank_account_number = COALESCE(?, bank_account_number),
        bank_account_type   = COALESCE(?, bank_account_type),
        amount              = COALESCE(?, amount),
        notes               = COALESCE(?, notes),
        updated_at          = NOW()
      WHERE id = ?
    `, { replacements: [
      bank_id || null, bank_account_number || null, bank_account_type || null,
      amount ?? null, notes || null, req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM payment_batch_lines WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Línea de pago no encontrada' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/payment-batch-lines/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar línea de pago' });
  }
});

// POST /api/payment-batch-lines/:id/status — update line status
router.post('/payment-batch-lines/:id/status', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { status, notes, processed_at } = req.body;
    const validStatuses = ['pending', 'processed', 'rejected', 'on_hold'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}` });
    }

    await sequelize.query(`
      UPDATE payment_batch_lines
      SET status = ?, notes = COALESCE(?, notes),
          processed_at = ?, updated_at = NOW()
      WHERE id = ?
    `, { replacements: [status, notes || null, processed_at || null, req.params.id] });

    const [row] = await sequelize.query('SELECT * FROM payment_batch_lines WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Línea de pago no encontrada' });
    res.json(row[0]);
  } catch (err) {
    console.error('POST /api/payment-batch-lines/:id/status error:', err);
    res.status(500).json({ error: 'Error al actualizar estado de línea de pago' });
  }
});

module.exports = router;
