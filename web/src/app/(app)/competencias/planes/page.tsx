'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { Target, Plus } from 'lucide-react';

const ACTION_TYPES: Record<string, string> = {
  TRAINING: 'Capacitación',
  MENTORING: 'Mentoría',
  ON_THE_JOB: 'En el Puesto',
  CERTIFICATION: 'Certificación',
  PROJECT: 'Proyecto',
  READING: 'Lectura',
};

const ACTION_COLORS: Record<string, string> = {
  TRAINING: 'bg-blue-100 text-blue-700',
  MENTORING: 'bg-purple-100 text-purple-700',
  ON_THE_JOB: 'bg-green-100 text-green-700',
  CERTIFICATION: 'bg-yellow-100 text-yellow-700',
  PROJECT: 'bg-indigo-100 text-indigo-700',
  READING: 'bg-gray-100 text-gray-700',
};

// Maps plan status to StatusBadge status keys + labels
const PLAN_STATUS_MAP: Record<string, { status: string; label: string }> = {
  draft: { status: 'draft', label: 'Borrador' },
  active: { status: 'active', label: 'Activo' },
  in_progress: { status: 'in_progress', label: 'En Progreso' },
  completed: { status: 'approved', label: 'Completado' },
  cancelled: { status: 'rejected', label: 'Cancelado' },
};

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function PlanesDesarrolloPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showNewAction, setShowNewAction] = useState(false);
  const [planForm, setPlanForm] = useState({ employee_id: '', title: '', description: '' });
  const [actionForm, setActionForm] = useState({ action_type: 'TRAINING', description: '', due_date: '', responsible_user_id: '' });

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const r = await api.get('/api/development-plans').catch(() => ({ data: [] }));
      const d = r.data;
      setPlans(Array.isArray(d) ? d : d.plans || []);
    } finally { setLoading(false); }
  }

  async function loadActions(planId: number) {
    try {
      const r = await api.get(`/api/development-plans/${planId}`);
      setActions(r.data?.actions || []);
    } catch { setActions([]); }
  }

  async function createPlan() {
    if (!planForm.employee_id || !planForm.title) return;
    try {
      await api.post('/api/development-plans', planForm);
      setShowNew(false);
      loadPlans();
    } catch {}
  }

  async function addAction() {
    if (!selectedPlan || !actionForm.description || !actionForm.action_type) return;
    try {
      await api.post(`/api/development-plans/${selectedPlan.id}/actions`, actionForm);
      setShowNewAction(false);
      loadActions(selectedPlan.id);
    } catch {}
  }

  async function updateActionStatus(actionId: number, status: string) {
    try {
      await api.put(`/api/development-plan-actions/${actionId}`, {
        status,
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      });
      if (selectedPlan) loadActions(selectedPlan.id);
    } catch {}
  }

  function fmtDate(val: string | null | undefined) {
    if (!val) return '-';
    return new Date(val).toLocaleDateString('es-PY');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <EnterprisePageHeader
        icon={Target}
        iconColor="bg-blue-700"
        title="Planes de Desarrollo"
        subtitle="Planes individuales de crecimiento y capacitación"
        breadcrumbs={[
          { label: 'Competencias', href: '/competencias' },
          { label: 'Planes de Desarrollo' },
        ]}
        actions={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} /> Nuevo plan
          </button>
        }
      />

      {/* Main layout: list + detail */}
      {!loading && plans.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Sin planes de desarrollo"
          description="Cree planes personalizados para el crecimiento de cada colaborador"
          action={{ label: '+ Nuevo plan', onClick: () => setShowNew(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plans table */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Planes ({plans.length})
            </h2>
            {loading && <p className="text-center py-8 text-gray-400 text-sm">Cargando...</p>}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Empleado', 'Título plan', 'Estado', 'Fecha límite', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {plans.map((p: any) => {
                    const cfg = PLAN_STATUS_MAP[p.status] ?? { status: 'draft', label: p.status };
                    const progress = p.progress_percentage ?? p.progress ?? null;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => { setSelectedPlan(p); loadActions(p.id); }}
                        className={`cursor-pointer hover:bg-gray-50 ${selectedPlan?.id === p.id ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-4 py-3 text-gray-700 text-xs">{p.employee_name || `#${p.employee_id}`}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-sm">{p.title}</p>
                          {p.objectives && (
                            <p className="text-xs text-gray-400 truncate max-w-[180px]">{p.objectives}</p>
                          )}
                          {progress != null && <ProgressBar value={progress} />}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={cfg.status} label={cfg.label} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(p.due_date || p.end_date)}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="text-xs text-blue-600 hover:underline">Detalle</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions panel */}
          <div>
            {selectedPlan ? (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Acciones — {selectedPlan.title}
                  </h2>
                  <button
                    onClick={() => setShowNewAction(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
                  >
                    <Plus size={11} /> Acción
                  </button>
                </div>
                <div className="space-y-3">
                  {actions.map((a: any) => (
                    <div
                      key={a.id}
                      className={`bg-white rounded-xl border p-4 ${a.status === 'completed' ? 'border-green-200 bg-green-50' : a.status === 'cancelled' ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[a.action_type] || 'bg-gray-100 text-gray-600'}`}>
                          {ACTION_TYPES[a.action_type] || a.action_type}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${a.status === 'completed' ? 'bg-green-100 text-green-700' : a.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                          {a.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mb-2">{a.description}</p>
                      {a.due_date && <p className="text-xs text-gray-400">Vence: {fmtDate(a.due_date)}</p>}
                      {a.status !== 'completed' && a.status !== 'cancelled' && (
                        <div className="flex gap-2 mt-3">
                          {a.status === 'pending' && (
                            <button onClick={() => updateActionStatus(a.id, 'in_progress')} className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">
                              Iniciar
                            </button>
                          )}
                          {a.status === 'in_progress' && (
                            <button onClick={() => updateActionStatus(a.id, 'completed')} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                              Completar
                            </button>
                          )}
                          <button onClick={() => updateActionStatus(a.id, 'cancelled')} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100">
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {actions.length === 0 && (
                    <div className="text-center py-6 text-gray-400 text-sm">Sin acciones. Agregue la primera.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <p className="text-gray-400 text-sm">Seleccione un plan para ver sus acciones</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVO PLAN ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Plan de Desarrollo</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Empleado <span className="text-red-500">*</span></label>
                <input value={planForm.employee_id} onChange={e => setPlanForm(p => ({ ...p, employee_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título del Plan <span className="text-red-500">*</span></label>
                <input value={planForm.title} onChange={e => setPlanForm(p => ({ ...p, title: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createPlan} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Crear</button>
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVA ACCIÓN ── */}
      {showNewAction && selectedPlan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nueva Acción</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={actionForm.action_type} onChange={e => setActionForm(p => ({ ...p, action_type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(ACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción <span className="text-red-500">*</span></label>
                <textarea value={actionForm.description} onChange={e => setActionForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Límite</label>
                <input type="date" value={actionForm.due_date} onChange={e => setActionForm(p => ({ ...p, due_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={addAction} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Agregar</button>
              <button onClick={() => setShowNewAction(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
