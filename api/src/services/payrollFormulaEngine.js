/**
 * payrollFormulaEngine.js
 *
 * Motor de cálculo de conceptos salariales.
 * Soporta:
 *   fixed                — monto fijo en el concepto o asignado al empleado
 *   percentage_base      — % sobre una base (ips_base, gross, net, etc.)
 *   percentage_concept   — % sobre el monto de otro concepto por código
 *   formula              — expresión aritmética evaluada por parser seguro
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
    if (row.param_type === 'integer') return parseInt(row.param_value, 10);
    if (row.param_type === 'decimal') return parseFloat(row.param_value);
    if (row.param_type === 'boolean') return row.param_value === 'true';
    return row.param_value;
  } catch {
    return null;
  }
}

// ─── Parser aritmético seguro para fórmulas de nómina ────────────
// Permite solo números, variables whitelisted, + - * / %, paréntesis,
// funciones min/max/round/floor/ceil/abs y referencias concepts.CODIGO.
// No usa eval, Function, acceso a objetos globales ni ejecución dinámica.
const ALLOWED_FUNCTIONS = new Set(['min', 'max', 'round', 'floor', 'ceil', 'abs']);
const OPERATORS = {
  '+': { precedence: 1, assoc: 'left', args: 2, fn: (a, b) => a + b },
  '-': { precedence: 1, assoc: 'left', args: 2, fn: (a, b) => a - b },
  '*': { precedence: 2, assoc: 'left', args: 2, fn: (a, b) => a * b },
  '/': { precedence: 2, assoc: 'left', args: 2, fn: (a, b) => (b === 0 ? 0 : a / b) },
  '%': { precedence: 2, assoc: 'left', args: 2, fn: (a, b) => (b === 0 ? 0 : a % b) },
  'u-': { precedence: 3, assoc: 'right', args: 1, fn: (a) => -a },
};

function flattenFormulaContext(context) {
  const flat = {
    base_salary: Number(context.base_salary || 0),
    gross: Number(context.gross || 0),
    ips_base: Number(context.ips_base || 0),
    days_worked: Number(context.days_worked || 0),
    days_in_month: Number(context.days_in_month || 30),
    hours_worked: Number(context.hours_worked || 0),
    'ips.employee_rate': Number(context.ips?.employee_rate || 0),
    'ips.employer_rate': Number(context.ips?.employer_rate || 0),
  };

  for (const [key, value] of Object.entries(context.params || {})) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) flat[`params.${key}`] = Number(value || 0);
  }
  for (const [key, value] of Object.entries(context.concepts || {})) {
    if (/^[A-Za-z0-9_\-]+$/.test(key)) flat[`concepts.${key}`] = Number(value || 0);
  }
  return flat;
}

function tokenizeFormula(formula) {
  const input = String(formula || '').replace(/\s+/g, '');
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\d|\./.test(ch)) {
      let j = i + 1;
      while (j < input.length && /\d|\./.test(input[j])) j += 1;
      const raw = input.slice(i, j);
      if (!/^\d+(\.\d+)?$|^\.\d+$/.test(raw)) throw new Error(`Número inválido: ${raw}`);
      tokens.push({ type: 'number', value: Number(raw) });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_.-]/.test(input[j])) j += 1;
      tokens.push({ type: 'identifier', value: input.slice(i, j) });
      i = j;
      continue;
    }

    if ('+-*/%(),'.includes(ch)) {
      tokens.push({ type: 'symbol', value: ch });
      i += 1;
      continue;
    }

    throw new Error(`Carácter no permitido en fórmula: ${ch}`);
  }
  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];
  let previous = null;

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    const next = tokens[idx + 1];

    if (token.type === 'number') {
      output.push(token);
      previous = token;
      continue;
    }

    if (token.type === 'identifier') {
      if (next?.value === '(') {
        if (!ALLOWED_FUNCTIONS.has(token.value)) throw new Error(`Función no permitida: ${token.value}`);
        stack.push({ type: 'function', value: token.value });
      } else {
        output.push(token);
      }
      previous = token;
      continue;
    }

    if (token.value === ',') {
      while (stack.length && stack[stack.length - 1].value !== '(') output.push(stack.pop());
      if (!stack.length) throw new Error('Separador de función inválido');
      previous = token;
      continue;
    }

    if (token.value === '(') {
      stack.push(token);
      previous = token;
      continue;
    }

    if (token.value === ')') {
      while (stack.length && stack[stack.length - 1].value !== '(') output.push(stack.pop());
      if (!stack.length) throw new Error('Paréntesis desbalanceado');
      stack.pop();
      if (stack.length && stack[stack.length - 1].type === 'function') output.push(stack.pop());
      previous = token;
      continue;
    }

    let op = token.value;
    if (op === '-' && (!previous || previous.value === '(' || previous.value === ',' || OPERATORS[previous.value])) {
      op = 'u-';
    }
    const operator = OPERATORS[op];
    if (!operator) throw new Error(`Operador no permitido: ${token.value}`);

    while (stack.length) {
      const top = stack[stack.length - 1];
      const topOp = OPERATORS[top.value];
      if (!topOp) break;
      const shouldPop = operator.assoc === 'left'
        ? operator.precedence <= topOp.precedence
        : operator.precedence < topOp.precedence;
      if (!shouldPop) break;
      output.push(stack.pop());
    }
    stack.push({ type: 'operator', value: op });
    previous = { type: 'operator', value: op };
  }

  while (stack.length) {
    const token = stack.pop();
    if (token.value === '(' || token.value === ')') throw new Error('Paréntesis desbalanceado');
    output.push(token);
  }
  return output;
}

function evaluateRpn(rpn, variables) {
  const stack = [];
  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }
    if (token.type === 'identifier') {
      if (!Object.prototype.hasOwnProperty.call(variables, token.value)) {
        throw new Error(`Variable no permitida o inexistente: ${token.value}`);
      }
      stack.push(Number(variables[token.value] || 0));
      continue;
    }
    if (token.type === 'function') {
      if (!ALLOWED_FUNCTIONS.has(token.value)) throw new Error(`Función no permitida: ${token.value}`);
      if (token.value === 'abs' || token.value === 'round' || token.value === 'floor' || token.value === 'ceil') {
        if (stack.length < 1) throw new Error(`Argumentos insuficientes para ${token.value}`);
        const a = stack.pop();
        const fn = token.value === 'abs' ? Math.abs
          : token.value === 'round' ? Math.round
          : token.value === 'floor' ? Math.floor
          : Math.ceil;
        stack.push(fn(a));
      } else {
        if (stack.length < 2) throw new Error(`Argumentos insuficientes para ${token.value}`);
        const b = stack.pop();
        const a = stack.pop();
        stack.push(token.value === 'min' ? Math.min(a, b) : Math.max(a, b));
      }
      continue;
    }
    if (token.type === 'operator') {
      const op = OPERATORS[token.value];
      if (!op || stack.length < op.args) throw new Error(`Operador inválido: ${token.value}`);
      if (op.args === 1) stack.push(op.fn(stack.pop()));
      else {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(op.fn(a, b));
      }
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) return 0;
  return stack[0];
}

function evalFormula(formula, context) {
  try {
    const variables = flattenFormulaContext(context);
    return evaluateRpn(toRpn(tokenizeFormula(formula)), variables);
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
  const { companyId } = options;
  const periodDate = new Date(periodYear, periodMonth - 1, 1);
  const daysInMonth = new Date(periodYear, periodMonth, 0).getDate();

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
  const ipsRate = await getIpsRate(periodDate);
  const minWage = await getParam('salary.minimum_wage', companyId, periodDate) || 2700000;

  const [fixedConcepts] = await sequelize.query(`
    SELECT sc.*, COALESCE(efc.amount, sc.default_amount, 0) AS assigned_amount
    FROM salary_concepts sc
    LEFT JOIN employee_fixed_concepts efc
      ON efc.salary_concept_id = sc.id AND efc.employee_id = ? AND efc.is_active = 1
    WHERE sc.is_active = 1
      AND (sc.company_id = ? OR sc.company_id IS NULL)
    ORDER BY sc.priority_order ASC, sc.id ASC
  `, { replacements: [employeeId, companyId] });

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
  context.concepts.SALARIO_BASE = baseSalary;

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

    context.gross = gross;
    context.ips_base = ipsBase;
  }

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

  return {
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
}

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

module.exports = { calculateEmployeePayroll, persistPayrollItems, getIpsRate, getParam, evalFormula };
