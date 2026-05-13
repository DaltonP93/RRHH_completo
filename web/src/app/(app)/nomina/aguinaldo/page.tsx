'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}
function fmtGs(n: number) { return 'Gs. ' + Math.round(n||0).toLocaleString('es-PY'); }

const STATUS_COLORS: Record<string,string> = {
  draft:'bg-gray-100 text-gray-700', calculating:'bg-blue-100 text-blue-700',
  calculated:'bg-yellow-100 text-yellow-700', approved:'bg-green-100 text-green-700',
  paid:'bg-teal-100 text-teal-700', cancelled:'bg-red-100 text-red-700'
};

export default function AguinaldoPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');

  useEffect(() => { loadRuns(); }, []);

  async function loadRuns() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/aguinaldo`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setRuns(Array.isArray(d) ? d : d.runs || []); }
    } finally { setLoading(false); }
  }
  async function loadLines(id: number) {
    const r = await fetch(`${API}/api/aguinaldo/${id}`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setLines(d.lines || []); }
  }
  async function createRun() {
    const r = await fetch(`${API}/api/aguinaldo`, { method:'POST', headers: authHeaders(), body: JSON.stringify({year: newYear}) });
    if (r.ok) { setShowNew(false); loadRuns(); } else setError('Error al crear aguinaldo');
  }
  async function calculate(id: number) {
    if (!confirm('¿Calcular aguinaldo para todos los empleados?')) return;
    setLoading(true);
    const r = await fetch(`${API}/api/aguinaldo/${id}/calculate`, { method:'POST', headers: authHeaders() });
    setLoading(false);
    if (r.ok) { loadRuns(); if (selected?.id===id) loadLines(id); }
    else alert('Error al calcular');
  }
  async function approve(id: number) {
    if (!confirm('¿Aprobar este aguinaldo? Esta acción no puede revertirse.')) return;
    const r = await fetch(`${API}/api/aguinaldo/${id}/approve`, { method:'POST', headers: authHeaders() });
    if (r.ok) loadRuns(); else alert('Error al aprobar');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aguinaldo</h1>
          <p className="text-sm text-gray-500 mt-1">Doceava parte de las remuneraciones devengadas en el año calendario</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nuevo Aguinaldo</button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}<button className="ml-2" onClick={() => setError('')}>✕</button></div>}

      <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Base legal (Paraguay):</strong> El aguinaldo equivale a la doceava parte de todas las remuneraciones devengadas en el año: salario, horas extras, comisiones y otros conceptos computables.
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading && <div className="text-center py-8 text-gray-400">Cargando...</div>}
        {runs.map((run: any) => (
          <div key={run.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg">{run.year}</div>
                <div>
                  <h3 className="font-semibold text-gray-900">Aguinaldo {run.year}</h3>
                  <p className="text-sm text-gray-500">Total calculado: {fmtGs(run.total_amount)}</p>
                  {run.payment_date && <p className="text-xs text-gray-400">Fecha pago: {new Date(run.payment_date).toLocaleDateString('es-PY')}</p>}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[run.status]||'bg-gray-100 text-gray-600'}`}>{run.status}</span>
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
              <button onClick={() => { setSelected(run); loadLines(run.id); }} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Ver Detalle</button>
              {(run.status==='draft'||run.status==='calculated') && (
                <button onClick={() => calculate(run.id)} disabled={loading} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Calculando...' : 'Calcular'}
                </button>
              )}
              {run.status==='calculated' && (
                <button onClick={() => approve(run.id)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Aprobar</button>
              )}
              {run.status==='approved' && (
                <a href={`${API}/api/aguinaldo/${run.id}/export`} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">Exportar CSV</a>
              )}
            </div>
          </div>
        ))}
        {!loading && runs.length===0 && <div className="text-center py-12 text-gray-400">No hay aguinaldos registrados. Cree uno para el año actual.</div>}
      </div>

      {/* DETAIL PANEL */}
      {selected && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Detalle Aguinaldo {selected.year}</h3>
            <button onClick={() => { setSelected(null); setLines([]); }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Empleado','Meses','Rem. Acumulada','Monto Calculado','Anticipo','Monto a Pagar','Estado'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{l.employee_name||`Emp #${l.employee_id}`}</td>
                    <td className="px-3 py-2 text-gray-500">{l.months_worked}</td>
                    <td className="px-3 py-2">{fmtGs(l.accrued_remuneration)}</td>
                    <td className="px-3 py-2 font-medium text-green-700">{fmtGs(l.calculated_amount)}</td>
                    <td className="px-3 py-2 text-orange-600">{fmtGs(l.advance_amount)}</td>
                    <td className="px-3 py-2 font-bold">{fmtGs(l.paid_amount || l.calculated_amount - (l.advance_amount||0))}</td>
                    <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[l.status]||'bg-gray-100 text-gray-600'}`}>{l.status}</span></td>
                  </tr>
                ))}
                {lines.length===0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin líneas. Calcule primero.</td></tr>}
              </tbody>
              {lines.length>0 && (
                <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-gray-600">TOTALES</td>
                    <td className="px-3 py-2 text-green-700">{fmtGs(lines.reduce((s,l)=>s+(l.calculated_amount||0),0))}</td>
                    <td className="px-3 py-2 text-orange-600">{fmtGs(lines.reduce((s,l)=>s+(l.advance_amount||0),0))}</td>
                    <td className="px-3 py-2">{fmtGs(lines.reduce((s,l)=>s+(l.paid_amount||l.calculated_amount-(l.advance_amount||0)||0),0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* NEW MODAL */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Aguinaldo</h2>
            <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
            <input type="number" value={newYear} onChange={e => setNewYear(+e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"/>
            <p className="text-xs text-gray-500 mb-4">Se creará el aguinaldo para el año {newYear}. Luego podrá calcular los montos para cada empleado.</p>
            <div className="flex gap-3">
              <button onClick={createRun} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Crear</button>
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
