const { MODULES, defaultsForRole } = require('../src/services/permissionMatrix');

describe('permissionMatrix.defaultsForRole', () => {
  test('super_admin tiene CRUD total en todos los módulos', () => {
    const d = defaultsForRole('super_admin');
    for (const m of MODULES) {
      expect(d[m.key]).toEqual({ can_view: 1, can_create: 1, can_update: 1, can_delete: 1 });
    }
  });

  test('admin tiene CRUD total', () => {
    const d = defaultsForRole('admin');
    expect(d.empleados.can_delete).toBe(1);
    expect(d.usuarios.can_update).toBe(1);
  });

  test('employee ve portal y no ve gestión/admin', () => {
    const d = defaultsForRole('employee');
    expect(d.mi_perfil.can_view).toBe(1);
    expect(d.empleados.can_view).toBe(0);
    expect(d.usuarios.can_view).toBe(0);
  });

  test('manager ve aprobaciones y supervisor, no crea empleados', () => {
    const d = defaultsForRole('manager');
    expect(d.aprobaciones.can_view).toBe(1);
    expect(d.aprobaciones.can_update).toBe(1);
    expect(d.supervisor.can_view).toBe(1);
    expect(d.empleados.can_create).toBe(0);
  });

  test('hr tiene gestión sin delete y configuración de lectura', () => {
    const d = defaultsForRole('hr');
    expect(d.empleados.can_view).toBe(1);
    expect(d.empleados.can_delete).toBe(0);
    expect(d.configuracion.can_view).toBe(1);
    expect(d.usuarios.can_view).toBe(0);
  });

  test('rol desconocido cae al default employee', () => {
    const d = defaultsForRole('marciano');
    expect(d.mi_perfil.can_view).toBe(1);
    expect(d.empleados.can_view).toBe(0);
  });
});
