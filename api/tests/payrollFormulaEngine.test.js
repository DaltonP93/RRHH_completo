/**
 * Tests del motor de fórmulas de nómina.
 * Mockea sequelize para no golpear la BD real.
 */
jest.mock('../src/config/database', () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock('../src/config/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(),
}));

const { sequelize } = require('../src/config/database');

// Importar después de mockear
let engine;
beforeAll(() => {
  engine = require('../src/services/payrollFormulaEngine');
});

beforeEach(() => sequelize.query.mockReset());

// ─── getIpsRate ──────────────────────────────────────────────────
describe('getIpsRate()', () => {
  test('retorna tasa de BD cuando existe', async () => {
    sequelize.query.mockResolvedValueOnce([[{ employee_rate: 9, employer_rate: 16.5 }]]);
    const rate = await engine.getIpsRate(new Date('2025-01-01'));
    expect(rate.employee_rate).toBe(9);
    expect(rate.employer_rate).toBe(16.5);
  });

  test('usa defaults si BD falla', async () => {
    sequelize.query.mockRejectedValueOnce(new Error('DB error'));
    const rate = await engine.getIpsRate();
    expect(rate.employee_rate).toBe(9.0);
    expect(rate.employer_rate).toBe(16.5);
  });

  test('usa defaults si no hay fila', async () => {
    sequelize.query.mockResolvedValueOnce([[undefined]]);
    const rate = await engine.getIpsRate();
    expect(rate.employee_rate).toBe(9.0);
  });
});

// ─── getParam ────────────────────────────────────────────────────
describe('getParam()', () => {
  test('retorna integer parseado', async () => {
    sequelize.query.mockResolvedValueOnce([[{ param_value: '2700000', param_type: 'integer' }]]);
    const val = await engine.getParam('salary.minimum_wage');
    expect(val).toBe(2700000);
  });

  test('retorna decimal parseado', async () => {
    sequelize.query.mockResolvedValueOnce([[{ param_value: '9.5', param_type: 'decimal' }]]);
    const val = await engine.getParam('ips.rate');
    expect(val).toBeCloseTo(9.5);
  });

  test('retorna null si no hay fila', async () => {
    sequelize.query.mockResolvedValueOnce([[undefined]]);
    const val = await engine.getParam('nonexistent');
    expect(val).toBeNull();
  });

  test('retorna null si BD falla', async () => {
    sequelize.query.mockRejectedValueOnce(new Error('DB error'));
    const val = await engine.getParam('any');
    expect(val).toBeNull();
  });
});

// ─── calculateEmployeePayroll ─────────────────────────────────────
describe('calculateEmployeePayroll()', () => {
  const mockEmployee = {
    id: 1, first_name: 'Juan', last_name: 'Pérez', code: 'EMP001',
    base_salary: 3000000, salary_base: 3000000, department_name: 'TI',
  };
  const mockAttendance = { days_worked: 22, hours_worked: 176 };
  const mockIpsRate    = { employee_rate: 9, employer_rate: 16.5 };
  const mockMinWage    = [{ param_value: '2700000', param_type: 'integer' }];

  beforeEach(() => {
    sequelize.query
      .mockResolvedValueOnce([[mockEmployee]])      // empleado
      .mockResolvedValueOnce([[mockAttendance]])    // asistencia
      .mockResolvedValueOnce([[mockIpsRate]])       // ips_rates
      .mockResolvedValueOnce([[mockMinWage[0]]])    // payroll_parameters
      .mockResolvedValueOnce([[]])                  // fixedConcepts (vacío)
    ;
  });

  test('calcula sueldo base, IPS empleado y neto correctamente', async () => {
    const result = await engine.calculateEmployeePayroll(1, 2025, 5, { companyId: 1 });
    expect(result.base_salary).toBe(3000000);
    expect(result.ips_employee).toBe(Math.round(3000000 * 0.09));
    expect(result.ips_employer).toBe(Math.round(3000000 * 0.165));
    expect(result.net_amount).toBe(result.gross_amount - result.ips_employee);
  });

  test('incluye item SALARIO_BASE en items', async () => {
    const result = await engine.calculateEmployeePayroll(1, 2025, 5, { companyId: 1 });
    const base = result.items.find(i => i.concept_code === 'SALARIO_BASE');
    expect(base).toBeDefined();
    expect(base.amount).toBe(3000000);
  });

  test('lanza si empleado no existe', async () => {
    sequelize.query.mockReset();
    sequelize.query.mockResolvedValueOnce([[undefined]]);
    await expect(engine.calculateEmployeePayroll(999, 2025, 5)).rejects.toThrow('no encontrado');
  });
});
