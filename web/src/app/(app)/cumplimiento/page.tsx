'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';

const COMM_TYPE_LABELS: Record<string, string> = {
  ALTA: 'Alta Personal', BAJA: 'Baja Personal', VACACIONES: 'Vacaciones',
  PERMISO: 'Permiso', SUSPENSION: 'Suspensión', ACCIDENTE: 'Accidente Laboral',
  LIQUIDACION: 'Liquidación', AGUINALDO: 'Aguinaldo', PLANILLA_ANUAL: 'Planilla Anual', AMONESTACION: 'Amonestación'
};
const STATUS_C: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700', generated: 'bg-blue-100 text-blue-700',
  submitted: 'bg-indigo-100 text-indigo-700', accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700', corrected: 'bg-orange-100 text-orange-700'
};
const COMPLIANCE_STATUS: Record<string, {bg:string,text:string,label:string}> = {
  CUMPLE: {bg:'bg-green-100',text:'text-green-700',label:'CUMPLE'},
  NO_CUMPLE: {bg:'bg-red-100',text:'text-red-700',label:'NO CUMPLE'},
  EN_REVISION: {bg:'bg-yellow-100',text:'text-yellow-700',label:'EN REVISIÓN'},
  OBSERVADO: {bg:'bg-orange-100',text:'text-orange-700',label:'OBSERVADO'},
};

export default function CumplimientoPage() {
  const [tab, setTab] = useState<'mtess'|'ips'|'planillas'|'calendario'>('mtess');
  const [complianceStatus, setComplianceStatus] = useState<any>(null);
  const [mtessComms, setMtessComms] = useState<any[]>([]);
  const [ipsRecords, setIpsRecords] = useState<any[]>([]);
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [commForm, setCommForm] = useState({ communication_type: 'LIQUIDACION', period_year: new Date().getFullYear(), period_month: new Date().getMonth() + 1, employee_id: '', notes: '' });
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadMtess(); }, [filterYear]);

  async function loadAll() {
    setLoading(true);
    try {
      const [cs, ip, pl, cal] = await Promise.all([
        api.get(`/api/compliance/status`).then(r => r.data).catch(() => null),
        api.get(`/api/compliance/ips`).then(r => r.data).catch(() => []),
        api.get(`/api/compliance/labor-planillas`).then(r => r.data).catch(() => []),
        api.get(`/api/compliance/calendar`).then(r => r.data).catch(() => []),
      ]);
      setComplianceStatus(cs);
      setIpsRecords(Array.isArray(ip) ? ip : ip?.records || []);
      setPlanillas(Array.isArray(pl) ? pl : pl?.planillas || []);
      setCalendar(Array.isArray(cal) ? cal : cal?.deadlines || []);
    } finally { setLoading(false); }
  }
  async function loadMtess() {
    try {
      const r = await api.get('/api/compliance/mtess', { params: { year: filterYear } });
      const d = r.data; setMtessComms(Array.isArray(d) ? d : d?.communications || []);
    } catch {}
  }
  async function saveComm() {
    try {
      await api.post('/api/compliance/mtess', commForm);
      setShowCommModal(false); loadMtess();
    } catch { alert('Error al registrar comunicación'); }
  }
  async function updateStatus(id: number, status: string) {
    try { await api.put(`/api/compliance/mtess/${id}`, { status }); loadMtess(); } catch {}
  }
  async function generatePlanilla(type: string, year: string) {
    try {
      await api.post('/api/compliance/labor-planillas', { planilla_type: type, period_year: year });
      loadAll(); alert('Planilla registrada');
    } catch {}
  }

  const cs = complianceStatus ? COMPLIANCE_STATUS[complianceStatus.status] || COMPLIANCE_STATUS.EN_REVISION : null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cumplimiento Legal</h1>
        {cs && (
          <span className={`px-4 py-2 rounded-full text-sm font-bold ${cs.bg} ${cs.text}`}>{cs.label}</span>
        )}
      </div>

      {/* Compliance check items */}
      {complianceStatus && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            ['Planillas','planillas_ok'],['Comunicaciones','comunicaciones_ok'],['Liquidaciones','liquidaciones_ok'],['Aguinaldo','aguinaldo_ok'],['Datos Patronales','datos_patronales_ok']
          ].map(([label,key]) => (
            <div key={key} className={`rounded-xl p-3 text-center border ${complianceStatus[key] ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="text-xl">{complianceStatus[key] ? '✅' : '❌'}</div>
              <div className="text-xs font-medium mt-1 text-gray-700">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[['mtess','MTESS/REOP'],['ips','IPS/REI'],['planillas','Planillas Laborales'],['calendario','Calendario Vencimientos']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab===k ? 'bg-white border border-b-white text-blue-600 border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {/* MTESS TAB */}
      {tab === 'mtess' && (
        <div>
          <div className="flex gap-3 justify-between mb-4 flex-wrap">
            <div className="flex gap-2 items-center">
              <label className="text-sm text-gray-600">Año:</label>
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={() => setShowCommModal(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nueva Comunicación</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Tipo','Empleado','Período','Estado','Fecha Envío','Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {mtessComms.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{COMM_TYPE_LABELS[c.communication_type]||c.communication_type}</span></td>
                    <td className="px-4 py-3 text-gray-700">{c.employee_name || (c.employee_id ? `Emp. #${c.employee_id}` : 'General')}</td>
                    <td className="px-4 py-3 text-gray-500">{c.period_year ? `${c.period_month}/${c.period_year}` : '-'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_C[c.status]||'bg-gray-100 text-gray-600'}`}>{c.status}</span></td>
                    <td className="px-4 py-3 text-gray-500">{c.submission_date ? new Date(c.submission_date).toLocaleDateString('es-PY') : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {c.status==='pending' && <button onClick={() => updateStatus(c.id,'generated')} className="text-xs text-blue-600 hover:underline">Generar</button>}
                        {c.status==='generated' && <button onClick={() => updateStatus(c.id,'submitted')} className="text-xs text-green-600 hover:underline">Marcar Enviado</button>}
                        {c.status==='submitted' && <button onClick={() => updateStatus(c.id,'accepted')} className="text-xs text-teal-600 hover:underline">Aceptado</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {mtessComms.length===0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay comunicaciones para {filterYear}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IPS TAB */}
      {tab === 'ips' && (
        <div>
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-800 font-medium">Régimen General IPS: Aporte Obrero 9% + Aporte Patronal 16.5% = Total 25.5%</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Período','Empleado','Salario Imponible','Ap. Obrero (9%)','Ap. Patronal (16.5%)','Total','Estado'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {ipsRecords.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{r.period_month}/{r.period_year}</td>
                    <td className="px-4 py-3 text-gray-700">{r.employee_name||`#${r.employee_id}`}</td>
                    <td className="px-4 py-3 font-medium">Gs. {(r.taxable_salary||0).toLocaleString('es-PY')}</td>
                    <td className="px-4 py-3 text-orange-700 font-medium">Gs. {(r.employee_contribution||0).toLocaleString('es-PY')}</td>
                    <td className="px-4 py-3 text-red-700 font-medium">Gs. {(r.employer_contribution||0).toLocaleString('es-PY')}</td>
                    <td className="px-4 py-3 font-bold">Gs. {(r.total_contribution||0).toLocaleString('es-PY')}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_C[r.status]||'bg-gray-100 text-gray-600'}`}>{r.status}</span></td>
                  </tr>
                ))}
                {ipsRecords.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay registros IPS. Calcule desde una liquidación aprobada.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PLANILLAS TAB */}
      {tab === 'planillas' && (
        <div>
          <div className="mb-4 flex gap-3 flex-wrap">
            {['EMPLEADOS_OBREROS','SUELDOS_JORNALES','RESUMEN_PERSONAS'].map(type => (
              <button key={type} onClick={() => generatePlanilla(type, filterYear)} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
                + {type.replace(/_/g,' ')} {filterYear}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Tipo','Año','Versión','Estado','Generado','Presentado','Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {planillas.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-medium">{p.planilla_type?.replace(/_/g,' ')}</span></td>
                    <td className="px-4 py-3 text-gray-700">{p.period_year}</td>
                    <td className="px-4 py-3 text-gray-500">v{p.version}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_C[p.status]||'bg-gray-100 text-gray-600'}`}>{p.status}</span></td>
                    <td className="px-4 py-3 text-gray-500">{p.generated_at ? new Date(p.generated_at).toLocaleDateString('es-PY') : '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('es-PY') : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {p.status!=='submitted' && p.status!=='accepted' && <button onClick={async () => { try { await api.put(`/api/compliance/labor-planillas/${p.id}`, {status:'submitted',submitted_at:new Date().toISOString()}); loadAll(); } catch {} }} className="text-xs text-blue-600 hover:underline">Marcar Presentado</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {planillas.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay planillas. Genere una con los botones de arriba.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CALENDARIO TAB */}
      {tab === 'calendario' && (
        <div>
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
            <strong>Regla MTESS:</strong> La comunicación de liquidación del mes M se realiza en el mes M+2. El vencimiento depende de la terminación del número patronal (terminación 0 = día hábil 10, terminación 9 = día hábil 19).
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calendar.map((d: any, i: number) => (
              <div key={i} className={`rounded-xl border p-4 ${d.is_overdue ? 'border-red-300 bg-red-50' : d.is_soon ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-semibold text-gray-900">{d.description || d.communication_type}</span>
                  {d.is_overdue && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">VENCIDO</span>}
                  {d.is_soon && !d.is_overdue && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">PRÓXIMO</span>}
                </div>
                <p className="text-sm text-gray-600">{d.period || ''}</p>
                <p className="text-xs text-gray-500 mt-1">Vence: <strong>{d.due_date ? new Date(d.due_date).toLocaleDateString('es-PY') : d.due_label}</strong></p>
              </div>
            ))}
            {calendar.length===0 && <div className="col-span-3 text-center text-gray-400 py-8">No hay vencimientos próximos registrados.</div>}
          </div>
        </div>
      )}

      {/* COMM MODAL */}
      {showCommModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nueva Comunicación MTESS</h2>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={commForm.communication_type} onChange={e => setCommForm(p=>({...p,communication_type:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {Object.entries(COMM_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                <input type="number" value={commForm.period_year} onChange={e => setCommForm(p=>({...p,period_year:+e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
                <input type="number" min={1} max={12} value={commForm.period_month} onChange={e => setCommForm(p=>({...p,period_month:+e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Empleado (opcional)</label>
              <input value={commForm.employee_id} onChange={e => setCommForm(p=>({...p,employee_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Dejar vacío para comunicación general"/>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <textarea value={commForm.notes} onChange={e => setCommForm(p=>({...p,notes:e.target.value}))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"/>
            </div>
            <div className="flex gap-3">
              <button onClick={saveComm} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Registrar</button>
              <button onClick={() => setShowCommModal(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
