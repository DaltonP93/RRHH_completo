/**
 * payrollFormulaEngine.js
 *
 * Motor de cálculo de conceptos salariales.
 * Soporta:
 *   fixed                — monto fijo en el concepto o asignado al empleado
 *   percentage_base      — % sobre una base (ips_base, gross, net, etc.)
 *   percentage_concept   — % sobre el monto de otro concepto por código
 *   formula              — expresión JS evaluada con contexto seguro
 *   manual               — el operador ingresa el valor
 */

const { sequelize } = require('../config/database');
const logger = require('../config/logger');

// ─── Obtener tasa IPS vigente para una fecha ─────────────────────
async function getIpsRate(date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  try {
    const [[rate]] = await sequelize.query(`
      SELECT employee_rate, employer_rate
      FROM ips_rates
      WHERE effective_from <= ?
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY effective_from DESC
      LIMIT 1
    `, { replacements: [dateStr, dateStr] });
    return rate || { employee_rate: 9.0, employer_rate: 16.5 };
  } catch {
    return { employee_rate: 9.0, employer_rate: 16.5 };
  }
}

// ─── Obtener parámetro de nómina vigente ─────────────────────────
async function getParam(key, companyId = null, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  try {
    const [[row]] = await sequelize.query(`
      SELECT param_value, param_type FROM payroll_parameters
      WHERE param_key = ?
        AND (company_id = ? OR company_id IS NULL)
        AND effective_from <= ?
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY company_id DESC, effective_from DESC
      LIMIT 1
    `, { replacements: [key, companyId, dateStr, dateStr] });
    if (!row) return null;
    if (row.param_type === 'integer') return parseInt(row.param_value);
    if (row.param_type === 'decimal') return parseFloat(row.param_value);
    if (row.param_type === 'boolean') return row.param_value === 'true';
    return row.param_value;
  } catch {
    return null;
  }
}

// ─── Evaluar fórmula de forma segura ────────────────────────────
function evalFormula(formula, context) {
  // Contexto disponible en fórmulas:
  // base_salary, gross, ips_base, days_worked, days_in_month, hours_worked,
  // concepts[CODE], params.minimum_wage, ips.employee_rate, ips.employer_rate
  try {
    const fn = new Function(
      'base_salary', 'gross', 'ips_base', 'days_worked', 'days_in_month',
      'hours_worked', 'concepts', 'params', 'ips', 'Math', 'round',
      `"use strict"; return (${formula});`
    );
    return fn(
      context.base_salary || 0,
      context.gross || 0,
      context.ips_base || 0,
      context.days_worked || 0,
      context.days_in_month || 30,
      context.hours_worked || 0,
      context.concepts || {},
      context.params || {},
      context.ips || {},
      Math,
      (n) => Math.round(n)
    );
  } catch (err) {
    logger.warn(`Error evaluando fórmula "${formula}": ${err.message}`);
    return 0;
  }
}

// ─── Calcular un concepto ────────────────────────────────────────
function calculateConcept(concept, fixedAmount, context) {
  const type = concept.calculation_type || 'fixed';

  switch (type) {
    case 'fixed':
      return fixedAmount || parseFloat(concept.default_amount || 0);

    case 'percentage_base': {
      const pct = parseFloat(concept.percentage_value || 0) / 100;
      const base = concept.base_reference === 'ips_base' ? context.ips_base
        : concept.base_reference === 'gross' ? context.gross
        : concept.base_reference === 'base_salary' ? context.base_salary
        : context.gross;
      return Math.round(base * pct);
    }

    case 'percentage_concept': {
      const pct = parseFloat(concept.percentage_value || 0) / 100;
      const ref = context.concepts[concept.base_reference] || 0;
      return Math.round(ref * pct);
    }

    case 'formula':
      return Math.round(evalFormula(concept.formula || '0', context));

    case 'manual':
      return fixedAmount || 0;

    default:
      return fixedAmount || 0;
  }
}

// ─── Motor principal: calcular nómina de un empleado ─────────────
async function calculateEmployeePayroll(employeeId, periodYear, periodMonth, options = {}) {
  const { companyId, payrollRunId } = options;
  const periodDate = new Date(periodYear, periodMonth - 1, 1);
  const daysInMonth = new Date(periodYear, periodMonth, 0).getDate();

  // Datos del empleado
  const [[emp]] = await sequelize.query(`
    SELECT e.*, pp.base_salary, pp.bank_id, pp.payment_method,
           d.name AS department_name
    FROM employees e
    LEFT JOIN payroll_profiles pp ON pp.employee_id = e.id AND pp.status = 'active'
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.id = ?
  `, { replacements: [employeeId] });

  if (!emp) throw new Error(`Empleado ${employeeId} no encontrado`);

  const baseSalary = parseFloat(emp.base_salary || emp.salary_base || 0);

  // Días trabajados en el período
  const [[attendanceSummary]] = await sequelize.query(`
    SELECT
      COUNT(DISTINCT DATE(al.timestamp)) AS days_worked,
      SUM(TIMESTAMPDIFF(MINUTE,
        MIN(CASE WHEN al.type='in' THEN al.timestamp END),
        MAX(CASE WHEN al.type='out' THEN al.timestamp END)
      )) / 60.0 AS hours_worked
    FROM attendance_logs al
    WHERE al.employee_id = ? AND MONTH(al.timestamp) = ? AND YEAR(al.timestamp) = ?
  `, { replacements: [employeeId, periodMonth, periodYear] });

  const daysWorked = attendanceSummary?.days_worked || daysInMonth;
  const hoursWorked = parseFloat(attendanceSummary?.hours_worked || 0);

  // Tasa IPS vigente
  const ipsRate = await getIpsRate(periodDate);

  // Parámetros
  const minWage = await getParam('salary.minimum_wage', companyId, periodDate) || 2700000;

  // Conceptos asignados al empleado (fijos + globales de la empresa)
  const [fixedConcepts] = await sequelize.query(`
    SELECT sc.*, COALESCE(efc.amount, sc.default_amount, 0) AS assigned_amount
    FROM salary_concepts sc
    LEFT JOIN employee_fixed_concepts efc
      ON efc.salary_concept_id = sc.id AND efc.employee_id = ? AND efc.is_active = 1
    WHERE sc.is_active = 1
      AND (sc.company_id = ? OR sc.company_id IS NULL)
    ORDER BY sc.priority_order ASC, sc.id ASC
  `, { replacements: [employeeId, companyId] });

  // Contexto de evaluación
  const context = {
    base_salary: baseSalary,
    gross: baseSalary,
    ips_base: baseSalary,
    days_worked: daysWorked,
    days_in_month: daysInMonth,
    hours_worked: hoursWorked,
    concepts: {},
    params: { minimum_wage: minWage },
    ips: {
      employee_rate: parseFloat(ipsRate.employee_rate),
      employer_rate: parseFloat(ipsRate.employer_rate),
    },
  };

  const items = [];
  let gross = baseSalary;
  let ipsBase = baseSalary;

  // Concepto base: salario
  items.push({
    concept_code:  'SALARIO_BASE',
    concept_name:  'Sueldo Base',
    concept_type:  'INCOME',
    amount:        baseSalary,
    affects_ips:   1,
    is_ips_base:   1,
    days_worked:   daysWorked,
    calculation_type: 'fixed',
  });
  context.concepts['SALARIO_BASE'] = baseSalary;

  // Calcular conceptos en orden de prioridad
  for (const concept of fixedConcepts) {
    const code = concept.code?.toUpperCase();
    if (['SALARIO_BASE', 'IPS_EMPLEADO', 'IPS_PATRONAL'].includes(code)) continue;

    const amount = calculateConcept(concept, parseFloat(concept.assigned_amount || 0), context);
    if (amount === 0) continue;

    items.push({
      concept_code: code,
      concept_name: concept.name,
      concept_type: concept.concept_type,
      amount,
      affects_ips:  concept.affects_ips || 0,
      is_ips_base:  0,
      days_worked:  daysWorked,
      calculation_type: concept.calculation_type,
    });

    context.concepts[code] = amount;

    if (concept.concept_type === 'INCOME') {
      gross += amount;
      if (concept.affects_ips) ipsBase += amount;
    } else if (concept.concept_type === 'DEDUCTION') {
      gross -= amount;
    }

    // Actualizar contexto con nuevo gross/ips_base para fórmulas dependientes
    context.gross = gross;
    context.ips_base = ipsBase;
  }

  // IPS Empleado (deducción)
  const ipsEmpAmount = Math.round(ipsBase * parseFloat(ipsRate.employee_rate) / 100);
  items.push({
    concept_code: 'IPS_EMPLEADO',
    concept_name: `Aporte IPS Empleado (${ipsRate.employee_rate}%)`,
    concept_type: 'DEDUCTION',
    amount: ipsEmpAmount,
    affects_ips: 0,
    is_ips_base: 0,
    days_worked: daysWorked,
    calculation_type: 'percentage_base',
  });

  // IPS Patronal (contribución — no afecta el neto del empleado)
  const ipsEmprAmount = Math.round(ipsBase * parseFloat(ipsRate.employer_rate) / 100);
  items.push({
    concept_code: 'IPS_PATRONAL',
    concept_name: `Aporte IPS Patronal (${ipsRate.employer_rate}%)`,
    concept_type: 'CONTRIBUTION',
    amount: ipsEmprAmount,
    affects_ips: 0,
    is_ips_base: 0,
    days_worked: daysWorked,
    calculation_type: 'percentage_base',
  });

  const netAmount = gross - ipsEmpAmount;

  const result = {
    employee_id:    employeeId,
    employee_name:  `${emp.first_name} ${emp.last_name}`,
    employee_code:  emp.code,
    period_year:    periodYear,
    period_month:   periodMonth,
    days_worked:    daysWorked,
    hours_worked:   hoursWorked,
    base_salary:    baseSalary,
    ips_base:       ipsBase,
    gross_amount:   gross,
    ips_employee:   ipsEmpAmount,
    ips_employer:   ipsEmprAmount,
    net_amount:     netAmount,
    ips_rate:       ipsRate,
    items,
  };

  return result;
}

// ─── Persistir items calculados en payroll_items ─────────────────
async function persistPayrollItems(runId, calcResult) {
  for (const item of calcResult.items) {
    await sequelize.query(`
      INSERT INTO payroll_items
        (payroll_run_id, employee_id, concept_code, concept_name, concept_type,
         amount, affects_ips, days_worked, is_ips_base, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE amount = VALUES(amount)
    `, { replacements: [
      runId, calcResult.employee_id, item.concept_code, item.concept_name,
      item.concept_type, item.amount, item.affects_ips, item.days_worked,
      item.is_ips_base || 0,
    ]});
  }
}

module.exports = { calculateEmployeePayroll, persistPayrollItems, getIpsRate, getParam };
