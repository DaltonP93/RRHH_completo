/**
 * Tests del middleware de autorización.
 * Mockea sequelize para no golpear la BD real.
 */
jest.mock('../src/config/database', () => ({
  sequelize: { query: jest.fn() },
}));

const { sequelize } = require('../src/config/database');
const { authorize, requireSuperAdmin, requirePermission } = require('../src/middleware/auth');

function mkRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('authorize()', () => {
  test('rechaza sin usuario', () => {
    const next = jest.fn(); const res = mkRes();
    authorize('admin')({}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('super_admin bypass', () => {
    const next = jest.fn(); const res = mkRes();
    authorize('admin')({ user: { role: 'super_admin' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rol en lista → next', () => {
    const next = jest.fn(); const res = mkRes();
    authorize('admin', 'hr')({ user: { role: 'hr' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rol fuera de lista → 403', () => {
    const next = jest.fn(); const res = mkRes();
    authorize('admin')({ user: { role: 'employee' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireSuperAdmin()', () => {
  test('admin NO pasa', () => {
    const next = jest.fn(); const res = mkRes();
    requireSuperAdmin({ user: { role: 'admin' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  test('super_admin pasa', () => {
    const next = jest.fn(); const res = mkRes();
    requireSuperAdmin({ user: { role: 'super_admin' } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requirePermission()', () => {
  beforeEach(() => sequelize.query.mockReset());

  test('admin bypass sin tocar BD', async () => {
    const next = jest.fn(); const res = mkRes();
    await requirePermission('empleados', 'create')({ user: { id: 1, role: 'admin' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  test('employee no tiene view sobre empleados (default) → 403', async () => {
    sequelize.query.mockResolvedValue([[]]);
    const next = jest.fn(); const res = mkRes();
    await requirePermission('empleados', 'view')({ user: { id: 7, role: 'employee' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('manager con default aprobaciones.update → pasa', async () => {
    sequelize.query.mockResolvedValue([[]]);
    const next = jest.fn(); const res = mkRes();
    await requirePermission('aprobaciones', 'update')({ user: { id: 3, role: 'manager' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('override en user_permissions gana sobre rol', async () => {
    sequelize.query.mockResolvedValue([[{ can_view: 1, can_create: 0, can_update: 0, can_delete: 0 }]]);
    const next = jest.fn(); const res = mkRes();
    await requirePermission('empleados', 'view')({ user: { id: 9, role: 'employee' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('acción inválida lanza', () => {
    expect(() => requirePermission('empleados', 'foo')).toThrow();
  });
});
