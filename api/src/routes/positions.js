/**
 * positions.js — CRUD for positions, grade_levels, cost_centers, employee_types.
 *
 * Routes:
 *   GET/POST       /api/positions
 *   PUT/DELETE     /api/positions/:id
 *   GET/POST       /api/grade-levels
 *   PUT/DELETE     /api/grade-levels/:id
 *   GET/POST       /api/cost-centers
 *   PUT            /api/cost-centers/:id
 *   GET/POST       /api/employee-types
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

// ─── Positions ───────────────────────────────────────────────────────────────

// GET /api/positions
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    let sql = `
      SELECT p.*, c.legal_name AS company_name, gl.name AS grade_level_name
      FROM positions p
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN grade_levels gl ON gl.id = p.grade_level_id
      WHERE p.status != 'deleted'
    `;
    const replacements = [];
    if (company_id) {
      sql += ' AND p.company_id = ?';
      replacements.push(company_id);
    }
    sql += ' ORDER BY p.name ASC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/positions error:', err);
    res.status(500).json({ error: 'Error al obtener cargos' });
  }
});

// POST /api/positions
router.post('/', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      name, code, company_id, department_id, grade_level_id,
      cost_center_id, description, min_salary, max_salary
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO positions
        (name, code, company_id, department_id, grade_level_id, cost_center_id,
         description, min_salary, max_salary, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [
      name, code || null, company_id || null, department_id || null,
      grade_level_id || null, cost_center_id || null,
      description || null, min_salary || null, max_salary || null
    ]});

    const [row] = await sequelize.query('SELECT * FROM positions WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/positions error:', err);
    res.status(500).json({ error: 'Error al crear cargo' });
  }
});

// PUT /api/positions/:id
router.put('/:id', authorize('admin', 'hr', 'super_admin'), async (req, res) => {
  try {
    const {
      name, code, company_id, department_id, grade_level_id,
      cost_center_id, description, min_salary, max_salary, status
    } = req.body;

    await sequelize.query(`
      UPDATE positions SET
        name           = COALESCE(?, name),
        code           = COALESCE(?, code),
        company_id     = COALESCE(?, company_id),
        department_id  = COALESCE(?, department_id),
        grade_level_id = COALESCE(?, grade_level_id),
        cost_center_id = COALESCE(?, cost_center_id),
        description    = COALESCE(?, description),
        min_salary     = COALESCE(?, min_salary),
        max_salary     = COALESCE(?, max_salary),
        status         = COALESCE(?, status),
        updated_at     = NOW()
      WHERE id = ?
    `, { replacements: [
      name || null, code || null, company_id || null, department_id || null,
      grade_level_id || null, cost_center_id || null, description || null,
      min_salary || null, max_salary || null, status || null, req.params.id
    ]});

    const [row] = await sequelize.query('SELECT * FROM positions WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Cargo no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/positions/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar cargo' });
  }
});

// DELETE /api/positions/:id
router.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    await sequelize.query(
      "UPDATE positions SET status = 'inactive', updated_at = NOW() WHERE id = ?",
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Cargo desactivado correctamente' });
  } catch (err) {
    console.error('DELETE /api/positions/:id error:', err);
    res.status(500).json({ error: 'Error al desactivar cargo' });
  }
});

// ─── Grade Levels ────────────────────────────────────────────────────────────

// GET /api/grade-levels
router.get('/grade-levels', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT * FROM grade_levels WHERE status != 'deleted' ORDER BY level_order ASC, name ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/grade-levels error:', err);
    res.status(500).json({ error: 'Error al obtener niveles de grado' });
  }
});

// POST /api/grade-levels
router.post('/grade-levels', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, description, level_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO grade_levels (name, code, description, level_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [name, code || null, description || null, level_order || 0] });

    const [row] = await sequelize.query('SELECT * FROM grade_levels WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/grade-levels error:', err);
    res.status(500).json({ error: 'Error al crear nivel de grado' });
  }
});

// PUT /api/grade-levels/:id
router.put('/grade-levels/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, description, level_order, status } = req.body;

    await sequelize.query(`
      UPDATE grade_levels SET
        name        = COALESCE(?, name),
        code        = COALESCE(?, code),
        description = COALESCE(?, description),
        level_order = COALESCE(?, level_order),
        status      = COALESCE(?, status),
        updated_at  = NOW()
      WHERE id = ?
    `, { replacements: [name || null, code || null, description || null, level_order ?? null, status || null, req.params.id] });

    const [row] = await sequelize.query('SELECT * FROM grade_levels WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Nivel de grado no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/grade-levels/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar nivel de grado' });
  }
});

// DELETE /api/grade-levels/:id
router.delete('/grade-levels/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    await sequelize.query(
      "UPDATE grade_levels SET status = 'inactive', updated_at = NOW() WHERE id = ?",
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Nivel de grado desactivado correctamente' });
  } catch (err) {
    console.error('DELETE /api/grade-levels/:id error:', err);
    res.status(500).json({ error: 'Error al desactivar nivel de grado' });
  }
});

// ─── Cost Centers ────────────────────────────────────────────────────────────

// GET /api/cost-centers
router.get('/cost-centers', async (req, res) => {
  try {
    const { company_id } = req.query;
    let sql = `
      SELECT cc.*, c.legal_name AS company_name
      FROM cost_centers cc
      LEFT JOIN companies c ON c.id = cc.company_id
      WHERE cc.status != 'deleted'
    `;
    const replacements = [];
    if (company_id) {
      sql += ' AND cc.company_id = ?';
      replacements.push(company_id);
    }
    sql += ' ORDER BY cc.name ASC';

    const [rows] = await sequelize.query(sql, { replacements });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/cost-centers error:', err);
    res.status(500).json({ error: 'Error al obtener centros de costo' });
  }
});

// POST /api/cost-centers
router.post('/cost-centers', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, company_id, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO cost_centers (name, code, company_id, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [name, code || null, company_id || null, description || null] });

    const [row] = await sequelize.query('SELECT * FROM cost_centers WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/cost-centers error:', err);
    res.status(500).json({ error: 'Error al crear centro de costo' });
  }
});

// PUT /api/cost-centers/:id
router.put('/cost-centers/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, company_id, description, status } = req.body;

    await sequelize.query(`
      UPDATE cost_centers SET
        name        = COALESCE(?, name),
        code        = COALESCE(?, code),
        company_id  = COALESCE(?, company_id),
        description = COALESCE(?, description),
        status      = COALESCE(?, status),
        updated_at  = NOW()
      WHERE id = ?
    `, { replacements: [name || null, code || null, company_id || null, description || null, status || null, req.params.id] });

    const [row] = await sequelize.query('SELECT * FROM cost_centers WHERE id = ?', { replacements: [req.params.id] });
    if (!row.length) return res.status(404).json({ error: 'Centro de costo no encontrado' });
    res.json(row[0]);
  } catch (err) {
    console.error('PUT /api/cost-centers/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar centro de costo' });
  }
});

// ─── Employee Types ──────────────────────────────────────────────────────────

// GET /api/employee-types
router.get('/employee-types', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      "SELECT * FROM employee_types WHERE status != 'deleted' ORDER BY name ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/employee-types error:', err);
    res.status(500).json({ error: 'Error al obtener tipos de empleado' });
  }
});

// POST /api/employee-types
router.post('/employee-types', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, code, description, contract_type } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(`
      INSERT INTO employee_types (name, code, description, contract_type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', NOW(), NOW())
    `, { replacements: [name, code || null, description || null, contract_type || null] });

    const [row] = await sequelize.query('SELECT * FROM employee_types WHERE id = ?', { replacements: [result] });
    res.status(201).json(row[0]);
  } catch (err) {
    console.error('POST /api/employee-types error:', err);
    res.status(500).json({ error: 'Error al crear tipo de empleado' });
  }
});

module.exports = router;
