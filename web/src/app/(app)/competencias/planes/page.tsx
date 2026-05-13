'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const ACTION_TYPES: Record<string,string> = { TRAINING:'Capacitación', MENTORING:'Mentoría', ON_THE_JOB:'En el Puesto', CERTIFICATION:'Certificación', PROJECT:'Proyecto', READING:'Lectura' };
const ACTION_COLORS: Record<string,string> = { TRAINING:'bg-blue-100 text-blue-700', MENTORING:'bg-purple-100 text-purple-700', ON_THE_JOB:'bg-green-100 text-green-700', CERTIFICATION:'bg-yellow-100 text-yellow-700', PROJECT:'bg-indigo-100 text-indigo-700', READING:'bg-gray-100 text-gray-700' };
const PLAN_STATUS: Record<string,string> = { draft:'Borrador', active:'Activo', in_progress:'En Progreso', completed:'Completado', cancelled:'Cancelado' };
const PLAN_STATUS_C: Record<string,string> = { draft:'bg-gray-100 text-gray-600', active:'bg-blue-100 text-blue-700', in_progress:'bg-yellow-100 text-yellow-700', completed:'bg-green-100 text-green-700', cancelled:'bg-red-100 text-red-700' };

export default function PlanesDesarrolloPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showNewAction, setShowNewAction] = useState(false);
  const [planForm, setPlanForm] = useState({ employee_id:'', title:'', description:'' });
  const [actionForm, setActionForm] = useState({ action_type:'TRAINING', description:'', due_date:'', responsible_user_id:'' });

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/development-plans`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setPlans(Array.isArray(d) ? d : d.plans || []); }
    } finally { setLoading(false); }
  }
  async function loadActions(planId: number) {
    const r = await fetch(`${API}/api/development-plans/${planId}`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setActions(d.actions || []); }
  }
  async function createPlan() {
    if (!planForm.employee_id || !planForm.title) return;
    const r = await fetch(`${API}/api/development-plans`, { method:'POST', headers: authHeaders(), body: JSON.stringify(planForm) });
    if (r.ok) { setShowNew(false); loadPlans(); }
  }
  async function addAction() {
    if (!selectedPlan || !actionForm.description || !actionForm.action_type) return;
    const r = await fetch(`${API}/api/development-plans/${selectedPlan.id}/actions`, { method:'POST', headers: authHeaders(), body: JSON.stringify(actionForm) });
    if (r.ok) { setShowNewAction(false); loadActions(selectedPlan.id); }
  }
  async function updateActionStatus(actionId: number, status: string) {
    const r = await fetch(`${API}/api/development-plan-actions/${actionId}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify({ status, ...(status==='completed' ? {completed_at:new Date().toISOString()} : {}) }) });
    if (r.ok && selectedPlan) loadActions(selectedPlan.id);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes de Desarrollo</h1>
          <p className="text-sm text-gray-500 mt-1">Planes individuales de crecimiento profesional</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nuevo Plan</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plans list */}
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Planes ({plans.length})</h2>
          <div className="space-y-3">
            {loading && <div className="text-center py-8 text-gray-400">Cargando...</div>}
            {plans.map((p:any) => (
              <div key={p.id} onClick={() => { setSelectedPlan(p); loadActions(p.id); }}
                className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${selectedPlan?.id===p.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{p.title}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_STATUS_C[p.status]||'bg-gray-100 text-gray-600'}`}>{PLAN_STATUS[p.status]||p.status}</span>
                </div>
                <p className="text-xs text-gray-500">Empleado: {p.employee_name||`#${p.employee_id}`}</p>
                {p.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{p.description}</p>}
              </div>
            ))}
            {!loading && plans.length===0 && <div className="text-center py-8 text-gray-400 text-sm">No hay planes de desarrollo.</div>}
          </div>
        </div>

        {/* Actions panel */}
        <div>
          {selectedPlan ? (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Acciones — {selectedPlan.title}</h2>
                <button onClick={() => setShowNewAction(true)} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">+ Acción</button>
              </div>
              <div className="space-y-3">
                {actions.map((a:any) => (
                  <div key={a.id} className={`bg-white rounded-xl border p-4 ${a.status==='completed'?'border-green-200 bg-green-50':a.status==='cancelled'?'border-gray-200 opacity-60':'border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[a.action_type]||'bg-gray-100 text-gray-600'}`}>{ACTION_TYPES[a.action_type]||a.action_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${a.status==='completed'?'bg-green-100 text-green-700':a.status==='in_progress'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                    </div>
                    <p className="text-sm text-gray-800 mb-2">{a.description}</p>
                    {a.due_date && <p className="text-xs text-gray-400">Vence: {new Date(a.due_date).toLocaleDateString('es-PY')}</p>}
                    {a.status !== 'completed' && a.status !== 'cancelled' && (
                      <div className="flex gap-2 mt-3">
                        {a.status==='pending' && <button onClick={() => updateActionStatus(a.id,'in_progress')} className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">Iniciar</button>}
                        {a.status==='in_progress' && <button onClick={() => updateActionStatus(a.id,'completed')} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">Completar</button>}
                        <button onClick={() => updateActionStatus(a.id,'cancelled')} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100">Cancelar</button>
                      </div>
                    )}
                  </div>
                ))}
                {actions.length===0 && <div className="text-center py-6 text-gray-400 text-sm">Sin acciones. Agregue la primera.</div>}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-400 text-sm">Seleccione un plan para ver sus acciones</p>
            </div>
          )}
        </div>
      </div>

      {/* NEW PLAN MODAL */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Plan de Desarrollo</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Empleado <span className="text-red-500">*</span></label>
                <input value={planForm.employee_id} onChange={e => setPlanForm(p=>({...p,employee_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título del Plan <span className="text-red-500">*</span></label>
                <input value={planForm.title} onChange={e => setPlanForm(p=>({...p,title:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea value={planForm.description} onChange={e => setPlanForm(p=>({...p,description:e.target.value}))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"/>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createPlan} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Crear</button>
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW ACTION MODAL */}
      {showNewAction && selectedPlan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nueva Acción</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={actionForm.action_type} onChange={e => setActionForm(p=>({...p,action_type:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(ACTION_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción <span className="text-red-500">*</span></label>
                <textarea value={actionForm.description} onChange={e => setActionForm(p=>({...p,description:e.target.value}))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Límite</label>
                <input type="date" value={actionForm.due_date} onChange={e => setActionForm(p=>({...p,due_date:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={addAction} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Agregar</button>
              <button onClick={() => setShowNewAction(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
