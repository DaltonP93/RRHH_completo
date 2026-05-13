/**
 * aguinaldo.js — Christmas bonus (aguinaldo) management.
 *
 * Routes:
 *   GET/POST              /api/aguinaldo
 *   GET                   /api/aguinaldo/:id
 *   POST                  /api/aguinaldo/:id/calculate
 *   POST                  /api/aguinaldo/:id/approve
 *   GET                   /api/aguinaldo/:id/export
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// GET /api/aguinaldo — list christmas bonus runs
router.get('/', async (req, res) => {
  try {
    const { company_id, year, status } = req.query;
    let sql = `
      SELECT cbr.*,
             c.legal_name AS company_name,
             COUNT(cbl.id) AS employee_count,
             SUM(cbl.amount) AS total_amount
      FROM christmas_bonus_runs cbr
      LEFT JOIN companies c ON c.id = cbr.company_id
      LEFT JOIN christmas_bonus_lines cbl ON cbl.christmas_bonus_run_id = cbr.id
      WHERE 1=1
    `;
    const replacements = [];
    if (company_id) { sql += ' AND cbr.company_id = ?'; replacements.push(company_id); }
    if (year)       { sql += ' AND cbr.year = ?';        replacements.push(year); }
    if (status)     { sql += ' AND cbr.status = ?';      replacements.push(status); }
    sql += ' GROUP BY cbr.id ORDER BY cbr.year DESC, cbr.created_at DESC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/aguinaldo error:', err);
    res.status(500).json({ error: 'Error al obtener aguinaldos' });
  }
});

// POST /api/aguinaldo — create new christmas bonus run
router.post('/', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const { company_id, year, description } = req.body;
    if (!company_id || !year) {
      return res.status(400).json({ error: 'company_id y year son requeridos' });
    }

    // Check no duplicate for same company+year
    const [existing] = await sequelize.query(
      'SELECT id FROM christmas_bonus_runs WHERE company_id = ? AND year = ?',
      { replacements: [company_id, year] }
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Ya existe un aguinaldo para esta empresa y año' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO christmas_bonus_runs (company_id, year, description, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, NOW(), NOW())
    `, { replacements: [company_id, year, description || null, req.user.id] });

    const [row] = await sequelize.query('SELECT * FROM christmas_bonus_runs WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/aguinaldo error:', err);
    res.status(500).json({ error: 'Error al crear aguinaldo' });
  }
});

// GET /api/aguinaldo/:id — get run with lines
router.get('/:id', async (req, res) => {
  try {
    const [runs] = await sequelize.query(`
      SELECT cbr.*, c.legal_name AS company_name
      FROM christmas_bonus_runs cbr
      LEFT JOIN companies c ON c.id = cbr.company_id
      WHERE cbr.id = ?
    `, { replacements: [req.params.id] });

    if (!runs.length) return res.status(404).json({ error: 'Aguinaldo no encontrado' });

    const [lines] = await sequelize.query(`
      SELECT cbl.*,
             CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
             e.document_number, e.code AS employee_code,
             b.name AS bank_name
      FROM christmas_bonus_lines cbl
      JOIN employees e ON e.id = cbl.employee_id
      LEFT JOIN banks b ON b.id = cbl.bank_id
      WHERE cbl.christmas_bonus_run_id = ?
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [req.params.id] });

    res.json({ ...runs[0], lines });
  } catch (err) {
    console.error('GET /api/aguinaldo/:id error:', err);
    res.status(500).json({ error: 'Error al obtener aguinaldo' });
  }
});

// POST /api/aguinaldo/:id/calculate
router.post('/:id/calculate', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query(
      'SELECT * FROM christmas_bonus_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!runs.length) return res.status(404).json({ error: 'Aguinaldo no encontrado' });
    const run = runs[0];

    if (['approved', 'closed'].includes(run.status)) {
      return res.status(400).json({ error: `No se puede recalcular un aguinaldo en estado '${run.status}'` });
    }

    // Get active employees for company
    const [employees] = await sequelize.query(`
      SELECT e.*, pp.bank_id, pp.bank_account_number, pp.bank_account_type
      FROM employees e
      LEFT JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status = 'active'
      WHERE e.status = 'active' AND e.company_id = ?
    `, { replacements: [run.company_id] });

    let calculatedCount = 0;
    const yearStart = `${run.year}-01-01`;
    const yearEnd   = `${run.year}-12-31`;

    for (const emp of employees) {
      try {
        // Sum all settlement lines for the year that affect christmas bonus
        const [sumRows] = await sequelize.query(`
          SELECT COALESCE(SUM(sl.amount), 0) AS total_remuneration
          FROM settlement_lines sl
          JOIN employee_settlements es ON es.id = sl.employee_settlement_id
          JOIN payroll_runs pr ON pr.id = es.payroll_run_id
          JOIN salary_concepts sc ON sc.id = sl.salary_concept_id
          WHERE es.employee_id = ?
            AND pr.period_start >= ?
            AND pr.period_end <= ?
            AND sc.affects_christmas_bonus = 1
            AND pr.status IN ('approved', 'closed')
        `, { replacements: [emp.id, yearStart, yearEnd] });

        const totalRemuneration = parseFloat(sumRows[0]?.total_remuneration || 0);

        // Aguinaldo = sum of annual remunerations / 12
        const aguinaldoAmount = parseFloat((totalRemuneration / 12).toFixed(2));

        // Upsert line
        await sequelize.query(`
          INSERT INTO christmas_bonus_lines
            (christmas_bonus_run_id, employee_id, annual_remuneration, amount,
             bank_id, bank_account_number, bank_account_type, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'calculated', NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            annual_remuneration  = VALUES(annual_remuneration),
            amount               = VALUES(amount),
            bank_id              = VALUES(bank_id),
            bank_account_number  = VALUES(bank_account_number),
            bank_account_type    = VALUES(bank_account_type),
            status               = 'calculated',
            updated_at           = NOW()
        `, { replacements: [
          run.id, emp.id, totalRemuneration, aguinaldoAmount,
          emp.bank_id || null, emp.bank_account_number || null, emp.bank_account_type || null
        ]});

        calculatedCount++;
      } catch (empErr) {
        console.error(`Error calculando aguinaldo empleado ${emp.id}:`, empErr);
      }
    }

    // Update run status
    await sequelize.query(`
      UPDATE christmas_bonus_runs
      SET status = 'calculated', calculated_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, { replacements: [run.id] });

    res.json({ message: 'Cálculo de aguinaldo completado', calculated: calculatedCount });
  } catch (err) {
    console.error('POST /api/aguinaldo/:id/calculate error:', err);
    res.status(500).json({ error: 'Error al calcular aguinaldo' });
  }
});

// POST /api/aguinaldo/:id/approve
router.post('/:id/approve', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const [runs] = await sequelize.query(
      'SELECT * FROM christmas_bonus_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!runs.length) return res.status(404).json({ error: 'Aguinaldo no encontrado' });
    if (!['calculated', 'review'].includes(runs[0].status)) {
      return res.status(400).json({ error: 'Solo se pueden aprobar aguinaldos calculados o en revisión' });
    }

    await sequelize.query(`
      UPDATE christmas_bonus_runs
      SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, { replacements: [req.user.id, req.params.id] });

    const [updated] = await sequelize.query(
      'SELECT * FROM christmas_bonus_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('POST /api/aguinaldo/:id/approve error:', err);
    res.status(500).json({ error: 'Error al aprobar aguinaldo' });
  }
});

// GET /api/aguinaldo/:id/export — export CSV
router.get('/:id/export', async (req, res) => {
  try {
    const [runs] = await sequelize.query(
      'SELECT * FROM christmas_bonus_runs WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!runs.length) return res.status(404).json({ error: 'Aguinaldo no encontrado' });
    const run = runs[0];

    const [lines] = await sequelize.query(`
      SELECT
        e.document_number,
        CONCAT(e.last_name, ', ', e.first_name) AS nombre,
        b.name AS banco,
        cbl.bank_account_number AS cuenta,
        cbl.bank_account_type AS tipo_cuenta,
        cbl.amount AS monto_aguinaldo
      FROM christmas_bonus_lines cbl
      JOIN employees e ON e.id = cbl.employee_id
      LEFT JOIN banks b ON b.id = cbl.bank_id
      WHERE cbl.christmas_bonus_run_id = ?
      ORDER BY e.last_name ASC, e.first_name ASC
    `, { replacements: [req.params.id] });

    const header = 'documento,nombre,banco,cuenta,tipo_cuenta,monto_aguinaldo\n';
    const csvRows = lines.map(r =>
      [
        r.document_number || '',
        `"${(r.nombre || '').replace(/"/g, '""')}"`,
        `"${(r.banco || '').replace(/"/g, '""')}"`,
        r.cuenta || '',
        r.tipo_cuenta || '',
        r.monto_aguinaldo || 0
      ].join(',')
    );
    const csv = header + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=aguinaldo_${run.year}_${run.company_id}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('GET /api/aguinaldo/:id/export error:', err);
    res.status(500).json({ error: 'Error al exportar aguinaldo' });
  }
});

module.exports = router;
