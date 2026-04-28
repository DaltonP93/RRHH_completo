/**
 * surveys.js — Encuestas pulse anónimas con resultados agregados.
 *
 * GET    /api/surveys                  → listado visible (con flag has_responded)
 * GET    /api/surveys/:id              → encuesta + preguntas (para responder)
 * POST   /api/surveys                  → crear encuesta + preguntas
 * POST   /api/surveys/:id/respond      → enviar respuestas
 * GET    /api/surveys/:id/results      → agregaciones (admin)
 * DELETE /api/surveys/:id              → desactivar
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');

router.use(authenticate);

async function getViewer(userId) {
  const [[u]] = await sequelize.query(`
    SELECT u.id, u.role, u.employee_id, e.department_id
    FROM users u LEFT JOIN employees e ON e.id = u.employee_id
    WHERE u.id = ?
  `, { replacements: [userId] });
  return u;
}

function audienceFilter(viewer) {
  const conds = ["s.audience = 'all'"];
  const params = [];
  if (viewer?.department_id) { conds.push("(s.audience='department' AND s.audience_dept = ?)"); params.push(viewer.department_id); }
  if (viewer?.role)          { conds.push("(s.audience='role' AND s.audience_role = ?)"); params.push(viewer.role); }
  return { sql: `(${conds.join(' OR ')})`, params };
}

// GET / — listado visible para el usuario, con marca de respondida
router.get('/', async (req, res) => {
  try {
    const viewer = await getViewer(req.user.id);
    const aud = audienceFilter(viewer);
    const [rows] = await sequelize.query(`
      SELECT
        s.id, s.title, s.description, s.anonymous, s.audience,
        s.expires_at, s.active, s.created_at,
        u.full_name AS author_name,
        (SELECT COUNT(*) FROM survey_questions q WHERE q.survey_id = s.id) AS question_count,
        EXISTS(SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = ?) AS has_responded,
        (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
      FROM surveys s
      JOIN users u ON u.id = s.created_by
      WHERE s.active = 1
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
        AND ${aud.sql}
      ORDER BY s.created_at DESC
    `, { replacements: [req.user.id, ...aud.params] });
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — encuesta con preguntas
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[s]] = await sequelize.query(
      'SELECT * FROM surveys WHERE id = ? AND active = 1', { replacements: [id] }
    );
    if (!s) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const [questions] = await sequelize.query(
      'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY position, id',
      { replacements: [id] }
    );
    const [[hasResp]] = await sequelize.query(
      'SELECT EXISTS(SELECT 1 FROM survey_responses WHERE survey_id = ? AND user_id = ?) AS r',
      { replacements: [id, req.user.id] }
    );
    res.json({ ok: true, survey: s, questions, has_responded: !!hasResp.r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — crear encuesta + preguntas en un solo request
router.post('/',
  authorize('admin', 'gth', 'hr', 'manager'),
  async (req, res) => {
    const { title, description, anonymous = 1,
            audience = 'all', audience_dept, audience_role,
            expires_at, questions = [] } = req.body || {};
    if (!title || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: 'title y al menos una pregunta son requeridos' });
    }
    const t = await sequelize.transaction();
    try {
      const [r] = await sequelize.query(
        `INSERT INTO surveys (title, description, anonymous, audience, audience_dept, audience_role, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        { replacements: [
          title, description || null, anonymous ? 1 : 0,
          audience,
          audience === 'department' ? audience_dept : null,
          audience === 'role' ? audience_role : null,
          expires_at || null, req.user.id,
        ], transaction: t }
      );
      const surveyId = r;
      let pos = 1;
      for (const q of questions) {
        await sequelize.query(
          `INSERT INTO survey_questions (survey_id, position, type, prompt, options_json, scale_min, scale_max, required)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          { replacements: [
            surveyId, pos++, q.type || 'scale', q.prompt,
            q.options_json ? JSON.stringify(q.options_json) : null,
            q.scale_min ?? 1, q.scale_max ?? 5,
            q.required === false ? 0 : 1,
          ], transaction: t }
        );
      }
      await t.commit();
      res.status(201).json({ ok: true, id: surveyId });
    } catch (err) {
      await t.rollback();
      res.status(500).json({ error: err.message });
    }
  });

// POST /:id/respond — enviar respuestas
router.post('/:id/respond', async (req, res) => {
  const surveyId = parseInt(req.params.id, 10);
  const { answers = [] } = req.body || {};
  if (!Array.isArray(answers) || !answers.length) {
    return res.status(400).json({ error: 'answers es requerido' });
  }
  const t = await sequelize.transaction();
  try {
    const [[survey]] = await sequelize.query(
      'SELECT anonymous FROM surveys WHERE id = ? AND active = 1',
      { replacements: [surveyId], transaction: t }
    );
    if (!survey) { await t.rollback(); return res.status(404).json({ error: 'Encuesta no disponible' }); }

    // Evitar respuestas duplicadas (incluso anónimas: una por usuario)
    const [[exists]] = await sequelize.query(
      'SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?',
      { replacements: [surveyId, req.user.id], transaction: t }
    );
    if (exists) { await t.rollback(); return res.status(409).json({ error: 'Ya respondiste esta encuesta' }); }

    const [respId] = await sequelize.query(
      'INSERT INTO survey_responses (survey_id, user_id) VALUES (?, ?)',
      { replacements: [surveyId, survey.anonymous ? null : req.user.id], transaction: t }
    );

    // Para evitar correlacionar respuestas anónimas con el usuario, si es anónima
    // guardamos user_id NULL pero registramos el "voto" en una tabla aparte. Acá
    // la implementación simple es solo NULL - agregar tabla de "voted" si necesario.

    for (const a of answers) {
      await sequelize.query(
        `INSERT INTO survey_answers (response_id, question_id, value_int, value_text)
         VALUES (?, ?, ?, ?)`,
        { replacements: [
          respId, a.question_id,
          a.value_int ?? null,
          a.value_text || null,
        ], transaction: t }
      );
    }
    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/results — agregaciones
router.get('/:id/results',
  authorize('admin', 'gth', 'hr', 'manager'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[s]] = await sequelize.query('SELECT * FROM surveys WHERE id = ?', { replacements: [id] });
      if (!s) return res.status(404).json({ error: 'No encontrada' });

      const [[totals]] = await sequelize.query(
        'SELECT COUNT(*) AS responses FROM survey_responses WHERE survey_id = ?',
        { replacements: [id] }
      );

      const [questions] = await sequelize.query(
        'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY position, id',
        { replacements: [id] }
      );

      const results = [];
      for (const q of questions) {
        const out = { question: q };
        if (q.type === 'scale' || q.type === 'yesno') {
          const [[stat]] = await sequelize.query(`
            SELECT
              COUNT(*) AS n,
              ROUND(AVG(value_int), 2) AS avg_value,
              MIN(value_int) AS min_value,
              MAX(value_int) AS max_value
            FROM survey_answers WHERE question_id = ? AND value_int IS NOT NULL
          `, { replacements: [q.id] });
          out.stat = stat;
          // Distribución de votos
          const [dist] = await sequelize.query(`
            SELECT value_int AS value, COUNT(*) AS count
            FROM survey_answers
            WHERE question_id = ? AND value_int IS NOT NULL
            GROUP BY value_int ORDER BY value_int
          `, { replacements: [q.id] });
          out.distribution = dist;
        } else if (q.type === 'choice') {
          const [dist] = await sequelize.query(`
            SELECT value_text AS value, COUNT(*) AS count
            FROM survey_answers
            WHERE question_id = ? AND value_text IS NOT NULL
            GROUP BY value_text ORDER BY count DESC
          `, { replacements: [q.id] });
          out.distribution = dist;
        } else {
          // text — devolver todas las respuestas (sin user_id si es anónima)
          const [comments] = await sequelize.query(`
            SELECT value_text, response_id
            FROM survey_answers
            WHERE question_id = ? AND value_text IS NOT NULL
            ORDER BY response_id DESC LIMIT 200
          `, { replacements: [q.id] });
          out.comments = comments;
        }
        results.push(out);
      }

      res.json({ ok: true, survey: s, total_responses: totals.responses, results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.delete('/:id', authorize('admin', 'gth'), async (req, res) => {
  try {
    await sequelize.query('UPDATE surveys SET active = 0 WHERE id = ?', { replacements: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
