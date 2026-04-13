/**
 * users.js
 * CRUD de usuarios del sistema (admin, hr, supervisor, employee)
 * Solo admins pueden crear/editar usuarios.
 */

const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const logger  = require('../config/logger');

router.use(authenticate);

// GET /api/users — listar todos
router.get('/', authorize('admin', 'hr'), async (req, res) => {
  const { role, active = '1', search } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (active !== 'all') { where += ' AND u.active = ?'; params.push(+active); }
  if (role)   { where += ' AND u.role = ?'; params.push(role); }
  if (search) {
    where += ' AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  try {
    const [rows] = await sequelize.query(`
      SELECT
        u.id, u.username, u.email, u.full_name, u.role, u.active,
        u.last_login, u.created_at,
        e.id AS employee_id,
        CONCAT(e.first_name,' ',e.last_name) AS employee_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      ${where}
      ORDER BY u.role, u.full_name
    `, { replacements: params });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  // Solo admin puede ver a cualquier usuario; otros solo a sí mismos
  if (req.user.role !== 'admin' && req.user.id !== +req.params.id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  const [rows] = await sequelize.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.role, u.active,
            u.last_login, u.employee_id,
            CONCAT(e.first_name,' ',e.last_name) AS employee_name
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     WHERE u.id = ?`,
    { replacements: [req.params.id] }
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

// POST /api/users — crear usuario
router.post('/', authorize('admin'), async (req, res) => {
  const { username, email, password, full_name, role = 'hr', employee_id } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email y password son requeridos' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await sequelize.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, employee_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      { replacements: [username, email, hash, full_name || username, role, employee_id || null] }
    );
    logger.info(`Usuario creado: ${username} (${role})`);
    res.status(201).json({ id: result.insertId, message: 'Usuario creado' });
  } catch (err) {
    if (err.original?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El username o email ya existe' });
    }
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/users/:id — actualizar
router.put('/:id', authorize('admin'), async (req, res) => {
  const { full_name, email, role, active, employee_id } = req.body;
  try {
    await sequelize.query(
      `UPDATE users SET
        full_name   = COALESCE(?, full_name),
        email       = COALESCE(?, email),
        role        = COALESCE(?, role),
        active      = COALESCE(?, active),
        employee_id = COALESCE(?, employee_id)
       WHERE id = ?`,
      { replacements: [full_name, email, role, active, employee_id, req.params.id] }
    );
    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// PUT /api/users/:id/password — cambiar contraseña
router.put('/:id/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Solo admin puede cambiar sin currentPassword
  const isSelf = req.user.id === +req.params.id;
  if (!isSelf && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const [rows] = await sequelize.query(
      'SELECT password_hash FROM users WHERE id = ?',
      { replacements: [req.params.id] }
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Si es el propio usuario, verificar contraseña actual
    if (isSelf && req.user.role !== 'admin') {
      if (!currentPassword) return res.status(400).json({ error: 'Contraseña actual requerida' });
      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await sequelize.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      { replacements: [hash, req.params.id] }
    );
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// DELETE /api/users/:id — desactivar (nunca borrar)
router.delete('/:id', authorize('admin'), async (req, res) => {
  if (+req.params.id === req.user.id) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
  }
  await sequelize.query(
    'UPDATE users SET active = 0 WHERE id = ?',
    { replacements: [req.params.id] }
  );
  res.json({ message: 'Usuario desactivado' });
});

module.exports = router;
