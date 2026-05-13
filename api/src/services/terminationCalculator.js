/**
 * terminationCalculator.js
 *
 * Cálculo automático de preaviso e indemnización según el Código
 * Laboral de Paraguay (Ley 213/93 y modificaciones).
 *
 * Conceptos calculados:
 *   - Preaviso (Art. 87):  30d (<1 año), 45d (1–5 años), 60d (>5 años)
 *   - Indemnización (Art. 91):  15 días de jornal diario por año
 *   - Aguinaldo proporcional (Art. 243): 1/12 del sueldo anual por mes
 *   - Vacaciones proporcionales (Art. 222): días según antigüedad / 12
 *   - Diferencia salarial (si hay saldo de salario del mes en curso)
 */

const MONTHS_IN_YEAR = 12;

// ─── Años y meses de antigüedad ──────────────────────────────────
function yearsMonthsWorked(hireDate, terminationDate) {
  const hire  = new Date(hireDate);
  const term  = new Date(terminationDate);
  let years   = term.getFullYear() - hire.getFullYear();
  let months  = term.getMonth() - hire.getMonth();
  let days    = term.getDate() - hire.getDate();

  if (days < 0) months--;
  if (months < 0) { years--; months += 12; }
  if (months < 0) months = 0;

  const totalDays = Math.floor((term - hire) / 86400000);
  return { years, months, totalDays };
}

// ─── Días de preaviso según Art. 87 ──────────────────────────────
function pravisoDays(yearsWorked, terminationType = 'sin_causa') {
  if (terminationType === 'con_causa') return 0;
  if (yearsWorked < 1)  return 30;
  if (yearsWorked <= 5) return 45;
  return 60;
}

// ─── Vacaciones base según Art. 222 ──────────────────────────────
function vacationBaseDays(yearsWorked) {
  if (yearsWorked < 5)  return 12;
  if (yearsWorked < 10) return 18;
  return 30;
}

// ─── Cálculo principal ────────────────────────────────────────────
function calculateTermination({
  hireDate,
  terminationDate,
  baseSalary,
  terminationType = 'sin_causa',  // 'sin_causa' | 'con_causa' | 'renuncia'
  monthsSinceLastSalary = 0,      // meses sin cobrar (diferencia salarial)
  daysSinceLastSalaryPayment = 0, // días trabajados desde último pago
}) {
  const { years, months, totalDays } = yearsMonthsWorked(hireDate, terminationDate);
  const jornal = baseSalary / 30;  // jornal diario

  // 1. Preaviso
  const pravisoDias = pravisoDays(years, terminationType);
  const pravisoAmount = terminationType === 'renuncia' ? 0 : jornal * pravisoDias;

  // 2. Indemnización (solo para despido sin causa justificada)
  const indemnizacionDias = terminationType === 'sin_causa'
    ? 15 * Math.max(years, 1)  // mínimo 1 año
    : 0;
  const indemnizacionAmount = jornal * indemnizacionDias;

  // 3. Aguinaldo proporcional — meses trabajados en el año en curso
  const termMonth = new Date(terminationDate).getMonth() + 1; // 1–12
  const aguinaldoAmount = (baseSalary / MONTHS_IN_YEAR) * termMonth;

  // 4. Vacaciones proporcionales
  const vacBaseD = vacationBaseDays(years);
  const vacPropDias = Math.floor((vacBaseD / MONTHS_IN_YEAR) * (months + years * 12 - Math.floor(years) * 12));
  const actualVacMonths = months + (years % 1) * 12;
  const vacPropAmount = (jornal * vacBaseD / MONTHS_IN_YEAR) * Math.min(actualVacMonths, 12);

  // 5. Diferencia salarial del mes en curso
  const salarioPropAmount = jornal * daysSinceLastSalaryPayment;

  // Total
  const total = pravisoAmount + indemnizacionAmount + aguinaldoAmount + vacPropAmount + salarioPropAmount;

  return {
    employee_data: { hire_date: hireDate, termination_date: terminationDate, base_salary: baseSalary },
    tenure: { years, months, total_days: totalDays },
    termination_type: terminationType,
    items: [
      {
        code: 'PREAVISO',
        label: `Preaviso (${pravisoDias} días)`,
        days: pravisoDias,
        daily_rate: Math.round(jornal),
        amount: Math.round(pravisoAmount),
        legal_ref: 'Art. 87 Cód. Laboral',
      },
      {
        code: 'INDEMNIZACION',
        label: `Indemnización (15 días/año × ${Math.max(years, 1)} años)`,
        days: indemnizacionDias,
        daily_rate: Math.round(jornal),
        amount: Math.round(indemnizacionAmount),
        legal_ref: 'Art. 91 Cód. Laboral',
      },
      {
        code: 'AGUINALDO_PROP',
        label: `Aguinaldo proporcional (${termMonth} meses)`,
        months: termMonth,
        amount: Math.round(aguinaldoAmount),
        legal_ref: 'Art. 243 Cód. Laboral',
      },
      {
        code: 'VACACIONES_PROP',
        label: `Vacaciones proporcionales (${vacBaseD}d/año)`,
        days: Math.round(vacPropAmount / jornal),
        daily_rate: Math.round(jornal),
        amount: Math.round(vacPropAmount),
        legal_ref: 'Art. 222 Cód. Laboral',
      },
      {
        code: 'SALARIO_PROP',
        label: `Salario proporcional (${daysSinceLastSalaryPayment} días)`,
        days: daysSinceLastSalaryPayment,
        daily_rate: Math.round(jornal),
        amount: Math.round(salarioPropAmount),
        legal_ref: 'Art. 229 Cód. Laboral',
      },
    ].filter(i => i.amount > 0),
    total: Math.round(total),
    generated_at: new Date().toISOString(),
  };
}

module.exports = { calculateTermination, yearsMonthsWorked, pravisoDays };
