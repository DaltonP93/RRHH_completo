'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';

function fmtGs(n: number) { return 'Gs. ' + Math.round(n||0).toLocaleString('es-PY'); }

const STATUS_COLORS: Record<string,string> = {
  pending:'bg-yellow-100 text-yellow-700', approved:'bg-green-100 text-green-700',
  rejected:'bg-red-100 text-red-700', liquidated:'bg-gray-100 text-gray-600'
};
const STATUS_LABELS: Record<string,string> = { pending:'Pendiente', approved:'Aprobado', rejected:'Rechazado', liquidated:'Liquidado' };

export default function AnticipasPage() {
  const [advances, setAdvances] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ employee_id: '', salary_advance_type_id: '', amount: '', request_date: new Date().toISOString().split('T')[0], reason: '' });
  const [error, setError] = useState('');

  useEffect(() => { loadTypes(); loadAdvances(); }, []);
  useEffect(() => { loadAdvances(); }, [filterStatus, filterYear]);

  async function loadTypes() {
    try {
      const r = await api.get('/api/salary-advance-types');
      const d = r.data; setTypes(Array.isArray(d) ? d : d.types || []);
    } catch {}
  }
  async function loadAdvances() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (filterYear) params.year = filterYear;
      const r = await api.get('/api/salary-advances', { params });
      const d = r.data; setAdvances(Array.isArray(d) ? d : d.advances || []);
    } catch {} finally { setLoading(false); }
  }
  async function createAdvance() {
    if (!form.employee_id || !form.salary_advance_type_id || !form.amount) { setError('Complete los campos obligatorios'); return; }
    try {
      await api.post('/api/salary-advances', { ...form, amount: parseFloat(form.amount) });
      setShowNew(false);
      setForm({ employee_id:'', salary_advance_type_id:'', amount:'', request_date: new Date().toISOString().split('T')[0], reason:'' });
      loadAdvances();
    } catch { setError('Error al crear anticipo'); }
  }
  async function actionAdvance(id: number, action: 'approve'|'reject') {
    const msg = action==='approve' ? '¿Aprobar este anticipo?' : '¿Rechazar este anticipo?';
    if (!confirm(msg)) return;
    try {
      await api.post(`/api/salary-advances/${id}/${action}`);
      loadAdvances();
    } catch { alert('Error al procesar'); }
  }

  const totalPending = advances.filter(a => a.status==='pending').reduce((s,a) => s + (a.amount||0), 0);
  const totalApproved = advances.filter(a => a.status==='approved').reduce((s,a) => s + (a.amount||0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anticipos</h1>
          <p className="text-sm text-gray-500 mt-1">Anticipos de salario y aguinaldo</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nuevo Anticipo</button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}<button className="ml-2" onClick={() => setError('')}>✕</button></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{advances.filter(a=>a.status==='pending').length}</p>
          <p className="text-xs text-gray-500 mt-1">Pendientes de aprobación</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-sm font-bold text-yellow-700">{fmtGs(totalPending)}</p>
          <p className="text-xs text-gray-500 mt-1">Monto pendiente</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{advances.filter(a=>a.status==='approved').length}</p>
          <p className="text-xs text-gray-500 mt-1">Aprobados</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-sm font-bold text-green-700">{fmtGs(totalApproved)}</p>
          <p className="text-xs text-gray-500 mt-1">Monto aprobado</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>{['Empleado','Tipo','Monto','Fecha Solicitud','Razón','Estado','Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr> :
              advances.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.employee_name||`Emp #${a.employee_id}`}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{a.type_name||a.salary_advance_type_id}</span></td>
                  <td className="px-4 py-3 font-bold text-gray-900">{fmtGs(a.amount)}</td>
                  <td className="px-4 py-3 text-gray-500">{a.request_date ? new Date(a.request_date).toLocaleDateString('es-PY') : '-'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={a.reason}>{a.reason||'-'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status]||'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[a.status]||a.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {a.status==='pending' && <>
                        <button onClick={() => actionAdvance(a.id,'approve')} className="text-xs text-green-600 hover:underline font-medium">Aprobar</button>
                        <button onClick={() => actionAdvance(a.id,'reject')} className="text-xs text-red-600 hover:underline">Rechazar</button>
                      </>}
                      {a.status==='approved' && <span className="text-xs text-gray-400">Pendiente de nómina</span>}
                      {a.status==='liquidated' && <span className="text-xs text-gray-400">Descontado en nómina</span>}
                    </div>
                  </td>
                </tr>
              ))
            }
            {!loading && advances.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay anticipos</td></tr>}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Anticipo</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Empleado <span className="text-red-500">*</span></label>
                <input value={form.employee_id} onChange={e => setForm(p=>({...p,employee_id:e.target.value}))} placeholder="ID del empleado" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Anticipo <span className="text-red-500">*</span></label>
                <select value={form.salary_advance_type_id} onChange={e => setForm(p=>({...p,salary_advance_type_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  {types.map((t:any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Gs.) <span className="text-red-500">*</span></label>
                <input type="number" value={form.amount} onChange={e => setForm(p=>({...p,amount:e.target.value}))} placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Solicitud</label>
                <input type="date" value={form.request_date} onChange={e => setForm(p=>({...p,request_date:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <textarea value={form.reason} onChange={e => setForm(p=>({...p,reason:e.target.value}))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"/>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={createAdvance} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Crear Solicitud</button>
              <button onClick={() => { setShowNew(false); setError(''); }} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
