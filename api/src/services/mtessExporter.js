/**
 * mtessExporter.js
 *
 * Genera planillas oficiales del MTESS Paraguay:
 *   - Planilla de Empleados y Obreros (REOP)
 *   - Planilla de Sueldos y Jornales (Resumen mensual)
 *   - Declaración Jurada IPS (formato planilla)
 *
 * Formatos de salida: CSV (upload MTESS), XLSX (presentación física)
 */

const ExcelJS = require('exceljs');

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── Estilo Excel helpers ─────────────────────────────────────────
function headerStyle(color = 'FF1E40AF') {
  return {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    },
  };
}

function dataStyle(align = 'left') {
  return {
    font: { size: 9 },
    alignment: { horizontal: align, vertical: 'middle' },
    border: {
      top: { style: 'hair' }, bottom: { style: 'hair' },
      left: { style: 'hair' }, right: { style: 'hair' },
    },
  };
}

function applyStyle(cell, style) {
  Object.assign(cell, { style });
}

function titleRow(ws, text, cols) {
  const cell = ws.getCell(`A${ws.lastRow ? ws.lastRow.number + 1 : 1}`);
  cell.value = text;
  cell.font  = { bold: true, size: 12 };
  ws.mergeCells(`A${cell.row}:${String.fromCharCode(64 + cols)}${cell.row}`);
}

// ─── REOP — Planilla de Empleados y Obreros ───────────────────────
async function generateReop(run, rows, company) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SisHoras RRHH';
  wb.created = new Date();

  const ws = wb.addWorksheet('REOP');
  ws.properties.defaultRowHeight = 15;

  // Cabecera institucional
  ws.addRow([`PLANILLA DE EMPLEADOS Y OBREROS — Art. 42 Código del Trabajo`]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.mergeCells('A1:O1');

  ws.addRow([`Empresa: ${company?.name || ''}   RUC: ${company?.ruc || ''}   Mes: ${MONTHS_ES[(run.period_month || 1) - 1]} ${run.period_year}`]);
  ws.getRow(2).font = { bold: true, size: 10 };
  ws.mergeCells('A2:O2');

  ws.addRow([]); // espacio

  // Encabezados de columnas
  const headers = [
    'N°', 'C.I.', 'Apellidos y Nombres', 'Cargo / Función',
    'Fecha Ingreso', 'Nro. IPS', 'Días\nTrabajados',
    'Sueldo\nMensual', 'Horas Extra', 'Bono / Comisión',
    'Total\nIngresos', 'Aporte\nIPS (9%)', 'Otras\nDeducciones',
    'Total\nDeducciones', 'Neto\nPagado',
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 35;
  headerRow.eachCell(cell => Object.assign(cell, headerStyle()));

  ws.columns = [
    { key: 'n',      width: 4  },
    { key: 'ci',     width: 12 },
    { key: 'nombre', width: 30 },
    { key: 'cargo',  width: 20 },
    { key: 'ingreso',width: 12 },
    { key: 'nroips', width: 12 },
    { key: 'dias',   width: 8  },
    { key: 'sueldo', width: 14 },
    { key: 'hext',   width: 10 },
    { key: 'bono',   width: 10 },
    { key: 'total_ing', width: 14 },
    { key: 'ips_emp',   width: 12 },
    { key: 'otras_ded', width: 12 },
    { key: 'total_ded', width: 14 },
    { key: 'neto',      width: 14 },
  ];

  let totSueldo = 0, totIps = 0, totNeto = 0, totIngresos = 0;

  rows.forEach((r, idx) => {
    const sueldo    = parseFloat(r.gross_income || r.base_salary || 0);
    const ipsEmp    = parseFloat(r.ips_employee_amount || r.ips_employee || Math.round(sueldo * 0.09));
    const otrasded  = parseFloat(r.other_deductions || 0);
    const totalDed  = ipsEmp + otrasded;
    const neto      = parseFloat(r.net_pay || r.net_amount || sueldo - totalDed);
    const ingresos  = sueldo;

    totSueldo   += sueldo;
    totIps      += ipsEmp;
    totNeto     += neto;
    totIngresos += ingresos;

    const row = ws.addRow([
      idx + 1,
      r.document_number || '',
      r.employee_name   || `${r.last_name || ''}, ${r.first_name || ''}`,
      r.position_name   || r.cargo || '',
      r.hire_date       ? new Date(r.hire_date).toLocaleDateString('es-PY') : '',
      r.ips_number      || '',
      r.worked_days     || 30,
      sueldo, 0, 0, ingresos, ipsEmp, otrasded, totalDed, neto,
    ]);

    row.height = 14;
    row.eachCell((cell, col) => {
      const isNum = col >= 8;
      cell.style = dataStyle(isNum ? 'right' : 'left');
      if (isNum && typeof cell.value === 'number') {
        cell.numFmt = '#,##0';
      }
    });
  });

  // Fila de totales
  const totRow = ws.addRow([
    '', '', 'TOTALES', '', '', '', '',
    totSueldo, 0, 0, totIngresos, totIps, 0, totIps, totNeto,
  ]);
  totRow.height = 16;
  totRow.eachCell((cell, col) => {
    cell.style = { ...dataStyle(col >= 8 ? 'right' : 'left'), font: { bold: true, size: 9 } };
    if (col >= 8 && typeof cell.value === 'number') cell.numFmt = '#,##0';
  });

  // Firmas
  ws.addRow([]);
  ws.addRow(['__________________________', '', '', '', '', '', '', '__________________________']);
  ws.addRow(['Empleador / Representante Legal', '', '', '', '', '', '', 'Contador / RRHH']);

  return wb.xlsx.writeBuffer();
}

// ─── Planilla Sueldos y Jornales (CSV MTESS) ─────────────────────
function generateSueldosCsv(run, rows) {
  const lines = [];
  lines.push('CI|APELLIDOS|NOMBRES|CARGO|FECHA_INGRESO|NRO_IPS|DIAS_TRAB|SUELDO_MENSUAL|IPS_EMPLEADO|IPS_PATRONAL|NETO_PAGADO|PERIODO');

  const periodo = `${run.period_year}${String(run.period_month).padStart(2, '0')}`;

  for (const r of rows) {
    const sueldo   = parseFloat(r.gross_income || r.base_salary || 0);
    const ipsEmp   = parseFloat(r.ips_employee_amount || Math.round(sueldo * 0.09));
    const ipsEmpr  = parseFloat(r.ips_employer_amount || Math.round(sueldo * 0.165));
    const neto     = parseFloat(r.net_pay || r.net_amount || sueldo - ipsEmp);
    const nombres  = (r.first_name || '').toUpperCase().replace(/\|/g, '/');
    const apellidos= (r.last_name  || (r.employee_name || '').split(',')[0] || '').toUpperCase().replace(/\|/g, '/');

    lines.push([
      r.document_number || '',
      apellidos,
      nombres,
      (r.position_name || '').replace(/\|/g, '/'),
      r.hire_date ? new Date(r.hire_date).toISOString().slice(0, 10) : '',
      r.ips_number || '',
      r.worked_days || 30,
      Math.round(sueldo),
      Math.round(ipsEmp),
      Math.round(ipsEmpr),
      Math.round(neto),
      periodo,
    ].join('|'));
  }

  return Buffer.from(lines.join('\n'), 'utf8');
}

// ─── Resumen de Personas Ocupadas (para MTESS) ────────────────────
function generateResumenJson(run, rows) {
  const sueldoTotal  = rows.reduce((s, r) => s + parseFloat(r.gross_income || r.base_salary || 0), 0);
  const ipsEmpTotal  = rows.reduce((s, r) => s + parseFloat(r.ips_employee_amount || 0), 0);
  const ipsEmprTotal = rows.reduce((s, r) => s + parseFloat(r.ips_employer_amount || 0), 0);
  const netoTotal    = rows.reduce((s, r) => s + parseFloat(r.net_pay || r.net_amount || 0), 0);

  return {
    periodo: `${MONTHS_ES[(run.period_month || 1) - 1]} ${run.period_year}`,
    total_empleados: rows.length,
    masa_salarial:   Math.round(sueldoTotal),
    total_ips_empleado:  Math.round(ipsEmpTotal),
    total_ips_patronal:  Math.round(ipsEmprTotal),
    total_neto_pagado:   Math.round(netoTotal),
    generado_en: new Date().toISOString(),
  };
}

module.exports = { generateReop, generateSueldosCsv, generateResumenJson };
