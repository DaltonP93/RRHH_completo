'use strict';
/**
 * competencies.js — Competency management, performance cycles, evaluations,
 *                   development plans, and training catalog.
 *
 * GET    /api/competency-categories
 * POST   /api/competency-categories
 * PUT    /api/competency-categories/:id
 * GET    /api/competencies
 * POST   /api/competencies
 * PUT    /api/competencies/:id
 * DELETE /api/competencies/:id                  soft delete
 * GET    /api/competency-levels
 * POST   /api/competency-levels
 * GET    /api/position-competencies/:positionId
 * POST   /api/position-competencies
 * PUT    /api/position-competencies/:id
 * DELETE /api/position-competencies/:id
 * GET    /api/performance-cycles
 * POST   /api/performance-cycles
 * PUT    /api/performance-cycles/:id
 * POST   /api/performance-cycles/:id/start
 * POST   /api/performance-cycles/:id/close
 * GET    /api/competency-evaluations
 * GET    /api/competency-evaluations/:id
 * POST   /api/competency-evaluations/:id/submit
 * GET    /api/employees/:employeeId/competency-gaps
 * GET    /api/employees/:employeeId/competency-score
 * GET    /api/development-plans
 * POST   /api/development-plans
 * GET    /api/development-plans/:id
 * POST   /api/development-plans/:id/actions
 * PUT    /api/development-plan-actions/:id
 * GET    /api/training-catalog
 * POST   /api/training-catalog
 * PUT    /api/training-catalog/:id
 * GET    /api/employee-trainings
 * POST   /api/employee-trainings
 * PUT    /api/employee-trainings/:id
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

const ADMIN_ROLES = ['admin', 'hr', 'gth', 'super_admin'];
const MGR_ROLES   = [...ADMIN_ROLES, 'manager', 'coordinator'];

// ─── COMPETENCY CATEGORIES ───────────────────────────────────────────────────

router.get('/competency-categories', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM competency_categories ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /competency-categories error:', err);
    res.status(500).json({ error: 'Error al listar categorías' });
  }
});

router.post('/competency-categories', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, company_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(
      `INSERT INTO competency_categories (name, description, company_id, created_at, updated_at)
       VALUES (?,?,?,NOW(),NOW())`,
      { replacements: [name, description || null, company_id || null] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM competency_categories WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /competency-categories error:', err);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

router.put('/competency-categories/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description } = req.body;
    await sequelize.query(
      `UPDATE competency_categories
          SET name        = COALESCE(?, name),
              description = COALESCE(?, description),
              updated_at  = NOW()
        WHERE id = ?`,
      { replacements: [name || null, description || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM competency_categories WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(updated);
  } catch (err) {
    console.error('[competencies] PUT /competency-categories/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
});

// ─── COMPETENCIES ────────────────────────────────────────────────────────────

router.get('/competencies', async (req, res) => {
  try {
    const { category_id, company_id } = req.query;
    let where = 'WHERE c.deleted_at IS NULL';
    const params = [];

    if (category_id) { where += ' AND c.category_id = ?'; params.push(Number(category_id)); }
    if (company_id)  { where += ' AND c.company_id = ?';  params.push(Number(company_id)); }

    const [rows] = await sequelize.query(
      `SELECT c.*, cc.name AS category_name
         FROM competencies c
         LEFT JOIN competency_categories cc ON cc.id = c.category_id
       ${where}
       ORDER BY c.name ASC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /competencies error:', err);
    res.status(500).json({ error: 'Error al listar competencias' });
  }
});

router.post('/competencies', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, category_id, company_id, competency_type } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(
      `INSERT INTO competencies (name, description, category_id, company_id, competency_type, created_at, updated_at)
       VALUES (?,?,?,?,?,NOW(),NOW())`,
      { replacements: [name, description || null, category_id || null, company_id || null, competency_type || 'generic'] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM competencies WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /competencies error:', err);
    res.status(500).json({ error: 'Error al crear competencia' });
  }
});

router.put('/competencies/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, category_id, competency_type } = req.body;
    await sequelize.query(
      `UPDATE competencies
          SET name             = COALESCE(?, name),
              description      = COALESCE(?, description),
              category_id      = COALESCE(?, category_id),
              competency_type  = COALESCE(?, competency_type),
              updated_at       = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
      { replacements: [name || null, description || null, category_id || null, competency_type || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM competencies WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Competencia no encontrada' });
    res.json(updated);
  } catch (err) {
    console.error('[competencies] PUT /competencies/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar competencia' });
  }
});

router.delete('/competencies/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM competencies WHERE id = ? AND deleted_at IS NULL',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Competencia no encontrada' });

    await sequelize.query(
      `UPDATE competencies SET deleted_at = NOW() WHERE id = ?`,
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Competencia eliminada' });
  } catch (err) {
    console.error('[competencies] DELETE /competencies/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar competencia' });
  }
});

// ─── COMPETENCY LEVELS ───────────────────────────────────────────────────────

router.get('/competency-levels', async (req, res) => {
  try {
    const { company_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (company_id) { where += ' AND company_id = ?'; params.push(Number(company_id)); }

    const [rows] = await sequelize.query(
      `SELECT * FROM competency_levels ${where} ORDER BY level_value ASC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /competency-levels error:', err);
    res.status(500).json({ error: 'Error al listar niveles' });
  }
});

router.post('/competency-levels', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, level_value, description, company_id } = req.body;
    if (!name || level_value === undefined) {
      return res.status(400).json({ error: 'name y level_value son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO competency_levels (name, level_value, description, company_id, created_at, updated_at)
       VALUES (?,?,?,?,NOW(),NOW())`,
      { replacements: [name, level_value, description || null, company_id || null] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM competency_levels WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /competency-levels error:', err);
    res.status(500).json({ error: 'Error al crear nivel' });
  }
});

// ─── POSITION COMPETENCIES ───────────────────────────────────────────────────

router.get('/position-competencies/:positionId', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT pc.*, c.name AS competency_name, c.description AS competency_description,
              cc.name AS category_name
         FROM position_competencies pc
         JOIN competencies c ON c.id = pc.competency_id
         LEFT JOIN competency_categories cc ON cc.id = c.category_id
        WHERE pc.position_id = ?
        ORDER BY c.name ASC`,
      { replacements: [req.params.positionId] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /position-competencies/:positionId error:', err);
    res.status(500).json({ error: 'Error al listar competencias del puesto' });
  }
});

router.post('/position-competencies', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { position_id, competency_id, required_level, weight } = req.body;
    if (!position_id || !competency_id) {
      return res.status(400).json({ error: 'position_id y competency_id son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO position_competencies (position_id, competency_id, required_level, weight, created_at, updated_at)
       VALUES (?,?,?,?,NOW(),NOW())`,
      { replacements: [position_id, competency_id, required_level || 1, weight || 1.0] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM position_competencies WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /position-competencies error:', err);
    if (err.original?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Esta competencia ya está asignada al puesto' });
    }
    res.status(500).json({ error: 'Error al asignar competencia al puesto' });
  }
});

router.put('/position-competencies/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { required_level, weight } = req.body;
    await sequelize.query(
      `UPDATE position_competencies
          SET required_level = COALESCE(?, required_level),
              weight         = COALESCE(?, weight),
              updated_at     = NOW()
        WHERE id = ?`,
      { replacements: [required_level || null, weight || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM position_competencies WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(updated);
  } catch (err) {
    console.error('[competencies] PUT /position-competencies/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar competencia del puesto' });
  }
});

router.delete('/position-competencies/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      'SELECT id FROM position_competencies WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!existing) return res.status(404).json({ error: 'Registro no encontrado' });

    await sequelize.query(
      'DELETE FROM position_competencies WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Competencia removida del puesto' });
  } catch (err) {
    console.error('[competencies] DELETE /position-competencies/:id error:', err);
    res.status(500).json({ error: 'Error al remover competencia del puesto' });
  }
});

// ─── PERFORMANCE CYCLES ──────────────────────────────────────────────────────

router.get('/performance-cycles', async (req, res) => {
  try {
    const { status, company_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status)     { where += ' AND pc.status = ?';     params.push(status); }
    if (company_id) { where += ' AND pc.company_id = ?'; params.push(Number(company_id)); }

    const [rows] = await sequelize.query(
      `SELECT pc.*,
              (SELECT COUNT(*) FROM competency_evaluations ce WHERE ce.cycle_id = pc.id) AS evaluation_count
         FROM performance_cycles pc
       ${where}
       ORDER BY pc.start_date DESC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /performance-cycles error:', err);
    res.status(500).json({ error: 'Error al listar ciclos' });
  }
});

router.post('/performance-cycles', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, start_date, end_date, company_id } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, start_date y end_date son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO performance_cycles (name, description, start_date, end_date, company_id, status, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,'draft',?,NOW(),NOW())`,
      { replacements: [name, description || null, start_date, end_date, company_id || null, req.user.id] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM performance_cycles WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /performance-cycles error:', err);
    res.status(500).json({ error: 'Error al crear ciclo' });
  }
});

router.put('/performance-cycles/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, start_date, end_date, status } = req.body;
    await sequelize.query(
      `UPDATE performance_cycles
          SET name        = COALESCE(?, name),
              description = COALESCE(?, description),
              start_date  = COALESCE(?, start_date),
              end_date    = COALESCE(?, end_date),
              status      = COALESCE(?, status),
              updated_at  = NOW()
        WHERE id = ?`,
      { replacements: [name || null, description || null, start_date || null, end_date || null, status || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM performance_cycles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Ciclo no encontrado' });
    res.json(updated);
  } catch (err) {
    console.error('[competencies] PUT /performance-cycles/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar ciclo' });
  }
});

router.post('/performance-cycles/:id/start', authorize(...ADMIN_ROLES), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const [[cycle]] = await sequelize.query(
      'SELECT * FROM performance_cycles WHERE id = ?',
      { replacements: [req.params.id], transaction: t }
    );
    if (!cycle) { await t.rollback(); return res.status(404).json({ error: 'Ciclo no encontrado' }); }
    if (cycle.status === 'active') {
      await t.rollback();
      return res.status(400).json({ error: 'El ciclo ya está activo' });
    }

    await sequelize.query(
      `UPDATE performance_cycles SET status='active', updated_at=NOW() WHERE id=?`,
      { replacements: [req.params.id], transaction: t }
    );

    // Auto-create evaluations for all active employees with positions
    const [employees] = await sequelize.query(
      `SELECT id, position_id FROM employees WHERE status='active' AND position_id IS NOT NULL`,
      { transaction: t }
    );

    for (const emp of employees) {
      await sequelize.query(
        `INSERT IGNORE INTO competency_evaluations
           (cycle_id, employee_id, position_id, status, created_at, updated_at)
         VALUES (?,?,?,'pending',NOW(),NOW())`,
        { replacements: [req.params.id, emp.id, emp.position_id], transaction: t }
      );
    }

    await t.commit();
    res.json({ message: 'Ciclo activado', evaluations_created: employees.length });
  } catch (err) {
    await t.rollback();
    console.error('[competencies] POST /performance-cycles/:id/start error:', err);
    res.status(500).json({ error: 'Error al activar ciclo' });
  }
});

router.post('/performance-cycles/:id/close', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const [[cycle]] = await sequelize.query(
      'SELECT * FROM performance_cycles WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });
    if (cycle.status === 'closed') {
      return res.status(400).json({ error: 'El ciclo ya está cerrado' });
    }

    await sequelize.query(
      `UPDATE performance_cycles SET status='closed', updated_at=NOW() WHERE id=?`,
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Ciclo cerrado' });
  } catch (err) {
    console.error('[competencies] POST /performance-cycles/:id/close error:', err);
    res.status(500).json({ error: 'Error al cerrar ciclo' });
  }
});

// ─── COMPETENCY EVALUATIONS ──────────────────────────────────────────────────

router.get('/competency-evaluations', async (req, res) => {
  try {
    const { cycle_id, employee_id, evaluator_type, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (cycle_id)      { where += ' AND ce.cycle_id = ?';      params.push(Number(cycle_id)); }
    if (employee_id)   { where += ' AND ce.employee_id = ?';   params.push(Number(employee_id)); }
    if (evaluator_type){ where += ' AND ce.evaluator_type = ?'; params.push(evaluator_type); }
    if (status)        { where += ' AND ce.status = ?';        params.push(status); }

    const [rows] = await sequelize.query(
      `SELECT ce.*,
              CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              pc.name AS cycle_name
         FROM competency_evaluations ce
         LEFT JOIN employees e ON e.id = ce.employee_id
         LEFT JOIN performance_cycles pc ON pc.id = ce.cycle_id
       ${where}
       ORDER BY ce.created_at DESC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /competency-evaluations error:', err);
    res.status(500).json({ error: 'Error al listar evaluaciones' });
  }
});

router.get('/competency-evaluations/:id', async (req, res) => {
  try {
    const [[evaluation]] = await sequelize.query(
      `SELECT ce.*,
              CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              pc.name AS cycle_name,
              p.name AS position_name
         FROM competency_evaluations ce
         LEFT JOIN employees e ON e.id = ce.employee_id
         LEFT JOIN performance_cycles pc ON pc.id = ce.cycle_id
         LEFT JOIN positions p ON p.id = ce.position_id
        WHERE ce.id = ?`,
      { replacements: [req.params.id] }
    );
    if (!evaluation) return res.status(404).json({ error: 'Evaluación no encontrada' });

    const [details] = await sequelize.query(
      `SELECT ced.*, c.name AS competency_name, c.description AS competency_description
         FROM competency_evaluation_details ced
         JOIN competencies c ON c.id = ced.competency_id
        WHERE ced.evaluation_id = ?
        ORDER BY c.name ASC`,
      { replacements: [req.params.id] }
    );

    res.json({ ...evaluation, details });
  } catch (err) {
    console.error('[competencies] GET /competency-evaluations/:id error:', err);
    res.status(500).json({ error: 'Error al obtener evaluación' });
  }
});

router.post('/competency-evaluations/:id/submit', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { details } = req.body; // [{competency_id, evaluated_level, evidence, comments}]
    if (!Array.isArray(details) || details.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'details es un array requerido' });
    }

    const [[evaluation]] = await sequelize.query(
      'SELECT * FROM competency_evaluations WHERE id = ?',
      { replacements: [req.params.id], transaction: t }
    );
    if (!evaluation) {
      await t.rollback();
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Get position competencies for weight/required_level
    const [posCompetencies] = await sequelize.query(
      `SELECT competency_id, required_level, weight
         FROM position_competencies
        WHERE position_id = ?`,
      { replacements: [evaluation.position_id], transaction: t }
    );
    const pcMap = {};
    for (const pc of posCompetencies) {
      pcMap[pc.competency_id] = pc;
    }

    // Upsert evaluation details
    for (const detail of details) {
      await sequelize.query(
        `INSERT INTO competency_evaluation_details
           (evaluation_id, competency_id, evaluated_level, evidence, comments, created_at, updated_at)
         VALUES (?,?,?,?,?,NOW(),NOW())
         ON DUPLICATE KEY UPDATE
           evaluated_level = VALUES(evaluated_level),
           evidence        = VALUES(evidence),
           comments        = VALUES(comments),
           updated_at      = NOW()`,
        {
          replacements: [
            req.params.id,
            detail.competency_id,
            detail.evaluated_level,
            detail.evidence || null,
            detail.comments || null,
          ],
          transaction: t,
        }
      );
    }

    // Calculate final_score = AVG(evaluated_level * weight / required_level * 100)
    let scoreSum = 0;
    let scoreCount = 0;
    const gaps = [];

    for (const detail of details) {
      const pc = pcMap[detail.competency_id];
      if (pc && pc.required_level > 0) {
        const contribution = (detail.evaluated_level * (pc.weight || 1)) / pc.required_level * 100;
        scoreSum += contribution;
        scoreCount++;

        // Identify gaps
        if (detail.evaluated_level < pc.required_level) {
          gaps.push({
            competency_id: detail.competency_id,
            evaluated_level: detail.evaluated_level,
            required_level: pc.required_level,
            gap_size: pc.required_level - detail.evaluated_level,
          });
        }
      }
    }

    const final_score = scoreCount > 0 ? scoreSum / scoreCount : 0;

    await sequelize.query(
      `UPDATE competency_evaluations
          SET status       = 'submitted',
              final_score  = ?,
              submitted_at = NOW(),
              updated_at   = NOW()
        WHERE id = ?`,
      { replacements: [final_score.toFixed(2), req.params.id], transaction: t }
    );

    // Insert competency gaps
    for (const gap of gaps) {
      await sequelize.query(
        `INSERT INTO competency_gaps
           (evaluation_id, employee_id, competency_id, evaluated_level, required_level, gap_size, created_at)
         VALUES (?,?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE
           evaluated_level = VALUES(evaluated_level),
           gap_size        = VALUES(gap_size)`,
        {
          replacements: [
            req.params.id,
            evaluation.employee_id,
            gap.competency_id,
            gap.evaluated_level,
            gap.required_level,
            gap.gap_size,
          ],
          transaction: t,
        }
      );
    }

    await t.commit();
    res.json({ message: 'Evaluación enviada', final_score, gaps_found: gaps.length });
  } catch (err) {
    await t.rollback();
    console.error('[competencies] POST /competency-evaluations/:id/submit error:', err);
    res.status(500).json({ error: 'Error al enviar evaluación' });
  }
});

// ─── EMPLOYEE COMPETENCY GAPS & SCORE ────────────────────────────────────────

router.get('/employees/:employeeId/competency-gaps', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT cg.*, c.name AS competency_name, cc.name AS category_name,
              pc.name AS cycle_name
         FROM competency_gaps cg
         JOIN competencies c ON c.id = cg.competency_id
         LEFT JOIN competency_categories cc ON cc.id = c.category_id
         LEFT JOIN competency_evaluations ce ON ce.id = cg.evaluation_id
         LEFT JOIN performance_cycles pc ON pc.id = ce.cycle_id
        WHERE cg.employee_id = ?
        ORDER BY cg.gap_size DESC`,
      { replacements: [req.params.employeeId] }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /employees/:employeeId/competency-gaps error:', err);
    res.status(500).json({ error: 'Error al obtener brechas' });
  }
});

router.get('/employees/:employeeId/competency-score', async (req, res) => {
  try {
    const [[result]] = await sequelize.query(
      `SELECT AVG(ce.final_score) AS average_score,
              MAX(ce.final_score) AS max_score,
              MIN(ce.final_score) AS min_score,
              COUNT(ce.id) AS evaluation_count
         FROM competency_evaluations ce
        WHERE ce.employee_id = ? AND ce.status = 'submitted'`,
      { replacements: [req.params.employeeId] }
    );

    const [latestEval] = await sequelize.query(
      `SELECT ce.id, ce.final_score, ce.submitted_at, pc.name AS cycle_name
         FROM competency_evaluations ce
         LEFT JOIN performance_cycles pc ON pc.id = ce.cycle_id
        WHERE ce.employee_id = ? AND ce.status = 'submitted'
        ORDER BY ce.submitted_at DESC
        LIMIT 1`,
      { replacements: [req.params.employeeId] }
    );

    res.json({ ...result, latest: latestEval[0] || null });
  } catch (err) {
    console.error('[competencies] GET /employees/:employeeId/competency-score error:', err);
    res.status(500).json({ error: 'Error al calcular score' });
  }
});

// ─── DEVELOPMENT PLANS ───────────────────────────────────────────────────────

router.get('/development-plans', async (req, res) => {
  try {
    const { employee_id, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (employee_id) { where += ' AND dp.employee_id = ?'; params.push(Number(employee_id)); }
    if (status)      { where += ' AND dp.status = ?';      params.push(status); }

    const [rows] = await sequelize.query(
      `SELECT dp.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name
         FROM development_plans dp
         LEFT JOIN employees e ON e.id = dp.employee_id
       ${where}
       ORDER BY dp.created_at DESC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /development-plans error:', err);
    res.status(500).json({ error: 'Error al listar planes de desarrollo' });
  }
});

router.post('/development-plans', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { employee_id, title, description, start_date, end_date, evaluation_id } = req.body;
    if (!employee_id || !title) {
      return res.status(400).json({ error: 'employee_id y title son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO development_plans
         (employee_id, title, description, start_date, end_date, evaluation_id, status, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'active',?,NOW(),NOW())`,
      { replacements: [employee_id, title, description || null, start_date || null, end_date || null, evaluation_id || null, req.user.id] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM development_plans WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /development-plans error:', err);
    res.status(500).json({ error: 'Error al crear plan de desarrollo' });
  }
});

router.get('/development-plans/:id', async (req, res) => {
  try {
    const [[plan]] = await sequelize.query(
      `SELECT dp.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name
         FROM development_plans dp
         LEFT JOIN employees e ON e.id = dp.employee_id
        WHERE dp.id = ?`,
      { replacements: [req.params.id] }
    );
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const [actions] = await sequelize.query(
      `SELECT * FROM development_plan_actions WHERE plan_id = ? ORDER BY due_date ASC`,
      { replacements: [req.params.id] }
    );

    res.json({ ...plan, actions });
  } catch (err) {
    console.error('[competencies] GET /development-plans/:id error:', err);
    res.status(500).json({ error: 'Error al obtener plan' });
  }
});

router.post('/development-plans/:id/actions', authorize(...MGR_ROLES), async (req, res) => {
  try {
    const { title, description, action_type, due_date, responsible_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido' });

    const [[plan]] = await sequelize.query(
      'SELECT id FROM development_plans WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const [result] = await sequelize.query(
      `INSERT INTO development_plan_actions
         (plan_id, title, description, action_type, due_date, responsible_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'pending',NOW(),NOW())`,
      { replacements: [req.params.id, title, description || null, action_type || 'training', due_date || null, responsible_id || null] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM development_plan_actions WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /development-plans/:id/actions error:', err);
    res.status(500).json({ error: 'Error al agregar acción' });
  }
});

router.put('/development-plan-actions/:id', async (req, res) => {
  try {
    const { title, description, status, due_date, completed_at } = req.body;
    await sequelize.query(
      `UPDATE development_plan_actions
          SET title        = COALESCE(?, title),
              description  = COALESCE(?, description),
              status       = COALESCE(?, status),
              due_date     = COALESCE(?, due_date),
              completed_at = COALESCE(?, completed_at),
              updated_at   = NOW()
        WHERE id = ?`,
      { replacements: [title || null, description || null, status || null, due_date || null, completed_at || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM development_plan_actions WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Acción no encontrada' });
    res.json(updated);
  } catch (err) {
    console.error('[competencies] PUT /development-plan-actions/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar acción' });
  }
});

// ─── TRAINING CATALOG ────────────────────────────────────────────────────────

router.get('/training-catalog', async (req, res) => {
  try {
    const { modality, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (modality) { where += ' AND modality = ?'; params.push(modality); }
    if (status)   { where += ' AND status = ?';   params.push(status); }

    const [rows] = await sequelize.query(
      `SELECT * FROM training_catalog ${where} ORDER BY name ASC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /training-catalog error:', err);
    res.status(500).json({ error: 'Error al listar catálogo de capacitaciones' });
  }
});

router.post('/training-catalog', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, modality, duration_hours, provider, cost, company_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const [result] = await sequelize.query(
      `INSERT INTO training_catalog
         (name, description, modality, duration_hours, provider, cost, company_id, status, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,'active',?,NOW(),NOW())`,
      { replacements: [name, description || null, modality || 'presencial', duration_hours || null, provider || null, cost || null, company_id || null, req.user.id] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM training_catalog WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /training-catalog error:', err);
    res.status(500).json({ error: 'Error al crear capacitación' });
  }
});

router.put('/training-catalog/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, modality, duration_hours, provider, cost, status } = req.body;
    await sequelize.query(
      `UPDATE training_catalog
          SET name           = COALESCE(?, name),
              description    = COALESCE(?, description),
              modality       = COALESCE(?, modality),
              duration_hours = COALESCE(?, duration_hours),
              provider       = COALESCE(?, provider),
              cost           = COALESCE(?, cost),
              status         = COALESCE(?, status),
              updated_at     = NOW()
        WHERE id = ?`,
      { replacements: [name || null, description || null, modality || null, duration_hours || null, provider || null, cost || null, status || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM training_catalog WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Capacitación no encontrada' });
    res.json(updated);
  } catch (err) {
    console.error('[competencies] PUT /training-catalog/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar capacitación' });
  }
});

// ─── EMPLOYEE TRAININGS ──────────────────────────────────────────────────────

router.get('/employee-trainings', async (req, res) => {
  try {
    const { employee_id, training_id, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (employee_id) { where += ' AND et.employee_id = ?';  params.push(Number(employee_id)); }
    if (training_id) { where += ' AND et.training_id = ?';  params.push(Number(training_id)); }
    if (status)      { where += ' AND et.status = ?';       params.push(status); }

    const [rows] = await sequelize.query(
      `SELECT et.*,
              CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              tc.name AS training_name, tc.modality
         FROM employee_trainings et
         LEFT JOIN employees e ON e.id = et.employee_id
         LEFT JOIN training_catalog tc ON tc.id = et.training_id
       ${where}
       ORDER BY et.enrolled_at DESC`,
      { replacements: params }
    );
    res.json(rows);
  } catch (err) {
    console.error('[competencies] GET /employee-trainings error:', err);
    res.status(500).json({ error: 'Error al listar capacitaciones de empleados' });
  }
});

router.post('/employee-trainings', authorize(...MGR_ROLES), async (req, res) => {
  try {
    const { employee_id, training_id, start_date, end_date, plan_action_id } = req.body;
    if (!employee_id || !training_id) {
      return res.status(400).json({ error: 'employee_id y training_id son requeridos' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO employee_trainings
         (employee_id, training_id, start_date, end_date, plan_action_id, status, enrolled_at, enrolled_by, created_at, updated_at)
       VALUES (?,?,?,?,?,'enrolled',NOW(),?,NOW(),NOW())`,
      { replacements: [employee_id, training_id, start_date || null, end_date || null, plan_action_id || null, req.user.id] }
    );
    const [[created]] = await sequelize.query(
      'SELECT * FROM employee_trainings WHERE id = ?',
      { replacements: [result] }
    );
    res.status(201).json(created);
  } catch (err) {
    console.error('[competencies] POST /employee-trainings error:', err);
    if (err.original?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El empleado ya está inscrito en esta capacitación' });
    }
    res.status(500).json({ error: 'Error al inscribir empleado' });
  }
});

router.put('/employee-trainings/:id', authorize(...MGR_ROLES), async (req, res) => {
  try {
    const { status, score, result: evalResult, completed_at, notes } = req.body;
    await sequelize.query(
      `UPDATE employee_trainings
          SET status       = COALESCE(?, status),
              score        = COALESCE(?, score),
              result       = COALESCE(?, result),
              completed_at = COALESCE(?, completed_at),
              notes        = COALESCE(?, notes),
              updated_at   = NOW()
        WHERE id = ?`,
      { replacements: [status || null, score || null, evalResult || null, completed_at || null, notes || null, req.params.id] }
    );
    const [[updated]] = await sequelize.query(
      'SELECT * FROM employee_trainings WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!updated) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(updated);
  } catch (err) {
    console.error('[competencies] PUT /employee-trainings/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar capacitación del empleado' });
  }
});

module.exports = router;
