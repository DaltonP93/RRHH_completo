'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const LEVEL_LABELS = ['','Inicial','Básico','Operativo','Avanzado','Experto'];
const SEVERITY_COLORS: Record<string,string> = { CRITICAL:'bg-red-100 text-red-700', HIGH:'bg-orange-100 text-orange-700', MEDIUM:'bg-yellow-100 text-yellow-700', LOW:'bg-blue-100 text-blue-700' };
const TYPE_LABELS: Record<string,string> = { TECHNICAL:'Técnica', BEHAVIORAL:'Conductual', LEADERSHIP:'Liderazgo', CLINICAL:'Clínica', ADMINISTRATIVE:'Administrativa' };

function Stars({ level, max=5 }: { level: number; max?: number }) {
  return <span className="text-yellow-400">{Array.from({length:max},(_,i)=><span key={i}>{i<level?'★':'☆'}</span>)}</span>;
}

export default function CompetenciasPage() {
  const [tab, setTab] = useState<'catalog'|'positions'|'cycles'|'gaps'|'training'>('catalog');
  const [categories, setCategories] = useState<any[]>([]);
  const [competencies, setCompetencies] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [posCompetencies, setPosCompetencies] = useState<any[]>([]);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [cycles, setCycles] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewComp, setShowNewComp] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [compForm, setCompForm] = useState({ category_id:'', code:'', name:'', description:'', competency_type:'TECHNICAL' });
  const [cycleForm, setCycleForm] = useState({ name:'', period_start:'', period_end:'' });

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (selectedPosition) loadPosCompetencies(selectedPosition); }, [selectedPosition]);

  async function loadAll() {
    setLoading(true);
    try {
      const [cats, comps, levs, pos, cyc, gps, trains] = await Promise.all([
        fetch(`${API}/api/competency-categories`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/competencies`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/competency-levels`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/positions`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/performance-cycles`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/competency-gaps`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/training-catalog`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
      ]);
      setCategories(Array.isArray(cats) ? cats : cats.categories || []);
      setCompetencies(Array.isArray(comps) ? comps : comps.competencies || []);
      setLevels(Array.isArray(levs) ? levs : levs.levels || []);
      setPositions(Array.isArray(pos) ? pos : pos.positions || []);
      setCycles(Array.isArray(cyc) ? cyc : cyc.cycles || []);
      setGaps(Array.isArray(gps) ? gps : gps.gaps || []);
      setTrainings(Array.isArray(trains) ? trains : trains.trainings || []);
    } finally { setLoading(false); }
  }
  async function loadPosCompetencies(posId: string) {
    const r = await fetch(`${API}/api/position-competencies/${posId}`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setPosCompetencies(Array.isArray(d) ? d : d.competencies || []); }
  }
  async function createCompetency() {
    if (!compForm.name || !compForm.category_id) return;
    const r = await fetch(`${API}/api/competencies`, { method:'POST', headers: authHeaders(), body: JSON.stringify(compForm) });
    if (r.ok) { setShowNewComp(false); loadAll(); }
  }
  async function createCycle() {
    if (!cycleForm.name || !cycleForm.period_start || !cycleForm.period_end) return;
    const r = await fetch(`${API}/api/performance-cycles`, { method:'POST', headers: authHeaders(), body: JSON.stringify(cycleForm) });
    if (r.ok) { setShowNewCycle(false); loadAll(); }
  }
  async function startCycle(id: number) {
    if (!confirm('¿Activar este ciclo? Se crearán evaluaciones para todos los empleados activos.')) return;
    const r = await fetch(`${API}/api/performance-cycles/${id}/start`, { method:'POST', headers: authHeaders() });
    if (r.ok) loadAll(); else alert('Error al activar ciclo');
  }
  async function closeCycle(id: number) {
    if (!confirm('¿Cerrar este ciclo?')) return;
    const r = await fetch(`${API}/api/performance-cycles/${id}/close`, { method:'POST', headers: authHeaders() });
    if (r.ok) loadAll();
  }

  const groupedComps = categories.map(cat => ({ ...cat, items: competencies.filter(c => c.category_id === cat.id) }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gestión por Competencias</h1>

      <div className="flex gap-1 border-b border-gray-200 mb-6 flex-wrap">
        {[['catalog','Catálogo'],['positions','Cargos vs Competencias'],['cycles','Ciclos de Evaluación'],['gaps','Brechas'],['training','Capacitación']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab===k ? 'bg-white border border-b-white text-blue-600 border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {/* CATALOG TAB */}
      {tab === 'catalog' && (
        <div>
          <div className="flex justify-between mb-4">
            <div className="flex gap-2 flex-wrap">
              {levels.slice(0,5).map(l => (
                <span key={l.id} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">Nivel {l.level_number}: {l.name}</span>
              ))}
            </div>
            <button onClick={() => setShowNewComp(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nueva Competencia</button>
          </div>
          <div className="space-y-4">
            {groupedComps.map(cat => cat.items.length > 0 && (
              <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                  <h3 className="font-semibold text-gray-800">{cat.name}</h3>
                  <span className="text-xs text-gray-400">{cat.items.length} competencias</span>
                </div>
                <table className="w-full text-sm">
                  <thead><tr>{['Código','Nombre','Tipo','Estado',''].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-gray-500">{h}</th>)}</tr></thead>
                  <tbody>{cat.items.map((c:any) => (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-blue-600">{c.code||'-'}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-2"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">{TYPE_LABELS[c.competency_type]||c.competency_type}</span></td>
                      <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded text-xs ${c.status==='active'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-600'}`}>{c.status==='active'?'Activa':'Inactiva'}</span></td>
                      <td className="px-4 py-2 text-right"><button className="text-xs text-gray-400 hover:text-blue-600">Editar</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
            {loading && <div className="text-center py-8 text-gray-400">Cargando...</div>}
          </div>
        </div>
      )}

      {/* POSITIONS TAB */}
      {tab === 'positions' && (
        <div>
          <div className="mb-4 flex gap-3 items-center">
            <label className="text-sm font-medium text-gray-700">Cargo:</label>
            <select value={selectedPosition} onChange={e => setSelectedPosition(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-48">
              <option value="">Seleccionar cargo...</option>
              {positions.map((p:any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {selectedPosition && posCompetencies.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>{['Competencia','Tipo','Nivel Requerido','Peso','Obligatoria',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{h}</th>)}</tr></thead>
                <tbody>{posCompetencies.map((pc:any) => (
                  <tr key={pc.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{pc.competency_name||`Comp #${pc.competency_id}`}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">{TYPE_LABELS[pc.competency_type]||'-'}</span></td>
                    <td className="px-4 py-3"><Stars level={pc.required_level}/> <span className="text-xs text-gray-500 ml-1">{LEVEL_LABELS[pc.required_level]}</span></td>
                    <td className="px-4 py-3 text-gray-600">{pc.weight}</td>
                    <td className="px-4 py-3">{pc.mandatory ? <span className="text-green-600 font-bold">Sí</span> : <span className="text-gray-400">No</span>}</td>
                    <td className="px-4 py-3 text-right"><button className="text-xs text-red-400 hover:text-red-600">Eliminar</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {selectedPosition && posCompetencies.length === 0 && <p className="text-gray-400 text-sm py-8 text-center">No hay competencias asignadas a este cargo.</p>}
        </div>
      )}

      {/* CYCLES TAB */}
      {tab === 'cycles' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowNewCycle(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nuevo Ciclo</button>
          </div>
          <div className="space-y-3">
            {cycles.map((c:any) => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-900">{c.name}</h3>
                  <p className="text-sm text-gray-500">{c.period_start ? new Date(c.period_start).toLocaleDateString('es-PY') : ''} — {c.period_end ? new Date(c.period_end).toLocaleDateString('es-PY') : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status==='active'?'bg-green-100 text-green-700':c.status==='closed'?'bg-gray-100 text-gray-600':'bg-yellow-100 text-yellow-700'}`}>{c.status}</span>
                  <div className="flex gap-2">
                    {c.status==='draft' && <button onClick={() => startCycle(c.id)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Activar</button>}
                    {c.status==='active' && <button onClick={() => closeCycle(c.id)} className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700">Cerrar</button>}
                    <a href={`/competencias/ciclo/${c.id}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Ver Evaluaciones</a>
                  </div>
                </div>
              </div>
            ))}
            {cycles.length===0 && <div className="text-center py-8 text-gray-400">No hay ciclos de evaluación.</div>}
          </div>
        </div>
      )}

      {/* GAPS TAB */}
      {tab === 'gaps' && (
        <div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Empleado','Competencia','Req.','Actual','Brecha','Severidad','Detectado'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {gaps.map((g:any) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.employee_name||`Emp #${g.employee_id}`}</td>
                    <td className="px-4 py-3 text-gray-700">{g.competency_name||`Comp #${g.competency_id}`}</td>
                    <td className="px-4 py-3"><Stars level={g.required_level}/></td>
                    <td className="px-4 py-3"><Stars level={g.current_level}/></td>
                    <td className="px-4 py-3 font-bold text-red-600">-{g.gap}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${SEVERITY_COLORS[g.severity]||'bg-gray-100 text-gray-600'}`}>{g.severity}</span></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{g.detected_at ? new Date(g.detected_at).toLocaleDateString('es-PY') : '-'}</td>
                  </tr>
                ))}
                {gaps.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay brechas detectadas.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRAINING TAB */}
      {tab === 'training' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trainings.map((t:any) => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{t.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs ${t.modality==='VIRTUAL'?'bg-blue-100 text-blue-700':t.modality==='PRESENCIAL'?'bg-green-100 text-green-700':'bg-purple-100 text-purple-700'}`}>{t.modality}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{t.provider||'Proveedor no especificado'}</p>
                <p className="text-xs text-gray-400">{t.duration_hours}h • {t.description?.slice(0,80)}{t.description?.length>80?'...':''}</p>
                <button className="mt-3 w-full py-1.5 border border-blue-300 text-blue-600 text-xs rounded-lg hover:bg-blue-50">Inscribir Empleado</button>
              </div>
            ))}
            {trainings.length===0 && <div className="col-span-3 text-center py-8 text-gray-400">No hay capacitaciones en el catálogo.</div>}
          </div>
        </div>
      )}

      {/* COMPETENCY MODAL */}
      {showNewComp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nueva Competencia</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select value={compForm.category_id} onChange={e => setCompForm(p=>({...p,category_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  {categories.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {[['code','Código'],['name','Nombre *']].map(([f,l]) => (
                <div key={f}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{l}</label>
                  <input value={(compForm as any)[f]} onChange={e => setCompForm(p=>({...p,[f]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={compForm.competency_type} onChange={e => setCompForm(p=>({...p,competency_type:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea value={compForm.description} onChange={e => setCompForm(p=>({...p,description:e.target.value}))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"/>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createCompetency} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Crear</button>
              <button onClick={() => setShowNewComp(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* CYCLE MODAL */}
      {showNewCycle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Ciclo de Evaluación</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Ciclo</label>
                <input value={cycleForm.name} onChange={e => setCycleForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Evaluación Anual 2026" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inicio</label>
                  <input type="date" value={cycleForm.period_start} onChange={e => setCycleForm(p=>({...p,period_start:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
                  <input type="date" value={cycleForm.period_end} onChange={e => setCycleForm(p=>({...p,period_end:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createCycle} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Crear Ciclo</button>
              <button onClick={() => setShowNewCycle(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
