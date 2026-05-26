'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { Award, Tag, BarChart2, RefreshCw, ClipboardList, BookOpen, Plus, Play, XCircle } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  TECHNICAL: 'Técnica',
  BEHAVIORAL: 'Conductual',
  LEADERSHIP: 'Liderazgo',
  CLINICAL: 'Clínica',
  ADMINISTRATIVE: 'Administrativa',
  técnica: 'Técnica',
  conductual: 'Conductual',
  liderazgo: 'Liderazgo',
};

const TYPE_COLORS: Record<string, string> = {
  TECHNICAL: 'bg-purple-50 text-purple-700',
  BEHAVIORAL: 'bg-teal-50 text-teal-700',
  LEADERSHIP: 'bg-blue-50 text-blue-700',
  CLINICAL: 'bg-rose-50 text-rose-700',
  ADMINISTRATIVE: 'bg-orange-50 text-orange-700',
  técnica: 'bg-purple-50 text-purple-700',
  conductual: 'bg-teal-50 text-teal-700',
  liderazgo: 'bg-blue-50 text-blue-700',
};

const MODALITY_COLORS: Record<string, string> = {
  VIRTUAL: 'bg-blue-50 text-blue-700',
  PRESENCIAL: 'bg-green-50 text-green-700',
  BLENDED: 'bg-purple-50 text-purple-700',
  virtual: 'bg-blue-50 text-blue-700',
  presencial: 'bg-green-50 text-green-700',
};

const ACTION_TYPES: Record<string, string> = {
  TRAINING: 'Capacitación',
  MENTORING: 'Mentoría',
  ON_THE_JOB: 'En el Puesto',
  CERTIFICATION: 'Certificación',
  PROJECT: 'Proyecto',
  READING: 'Lectura',
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-blue-100 text-blue-700',
};

function Stars({ level, max = 5 }: { level: number; max?: number }) {
  return (
    <span className="text-yellow-400">
      {Array.from({ length: max }, (_, i) => (
        <span key={i}>{i < level ? '★' : '☆'}</span>
      ))}
    </span>
  );
}

type TabKey = 'competencies' | 'categories' | 'levels' | 'cycles' | 'appraisals' | 'training';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'competencies', label: 'Competencias' },
  { key: 'categories', label: 'Categorías' },
  { key: 'levels', label: 'Niveles' },
  { key: 'cycles', label: 'Ciclos' },
  { key: 'appraisals', label: 'Evaluaciones' },
  { key: 'training', label: 'Capacitación' },
];

const APPRAISAL_STATUS: Record<string, { label: string; status: string }> = {
  pending: { label: 'Pendiente', status: 'pending' },
  in_progress: { label: 'En Progreso', status: 'in_progress' },
  submitted: { label: 'Enviado', status: 'submitted' },
  calibrated: { label: 'Calibrado', status: 'calibrated' },
};

export default function CompetenciasPage() {
  const [tab, setTab] = useState<TabKey>('competencies');
  const [categories, setCategories] = useState<any[]>([]);
  const [competencies, setCompetencies] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Legacy state kept for existing functionality
  const [positions, setPositions] = useState<any[]>([]);
  const [posCompetencies, setPosCompetencies] = useState<any[]>([]);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [gaps, setGaps] = useState<any[]>([]);
  const [showNewComp, setShowNewComp] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [compForm, setCompForm] = useState({ category_id: '', code: '', name: '', description: '', competency_type: 'TECHNICAL' });
  const [cycleForm, setCycleForm] = useState({ name: '', period_start: '', period_end: '' });

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (selectedPosition) loadPosCompetencies(selectedPosition); }, [selectedPosition]);

  async function loadAll() {
    setLoading(true);
    try {
      const [cats, comps, levs, pos, cyc, gps, trains, apprs] = await Promise.all([
        api.get('/api/competency-categories').then(r => r.data).catch(() => []),
        api.get('/api/competencies').then(r => r.data).catch(() => []),
        api.get('/api/competency-levels').then(r => r.data).catch(() => []),
        api.get('/api/positions').then(r => r.data).catch(() => []),
        api.get('/api/performance-cycles').then(r => r.data).catch(() => []),
        api.get('/api/competency-gaps').then(r => r.data).catch(() => []),
        api.get('/api/training-catalog').then(r => r.data).catch(() => []),
        api.get('/api/appraisals').then(r => r.data).catch(() => ({ data: [] })),
      ]);
      setCategories(Array.isArray(cats) ? cats : cats.categories || []);
      setCompetencies(Array.isArray(comps) ? comps : comps.competencies || []);
      setLevels(Array.isArray(levs) ? levs : levs.levels || []);
      setPositions(Array.isArray(pos) ? pos : pos.positions || []);
      setCycles(Array.isArray(cyc) ? cyc : cyc.cycles || []);
      setGaps(Array.isArray(gps) ? gps : gps.gaps || []);
      setTrainings(Array.isArray(trains) ? trains : trains.trainings || []);
      const apprsData = Array.isArray(apprs) ? apprs : (apprs?.data || []);
      setAppraisals(Array.isArray(apprsData) ? apprsData : []);
    } finally { setLoading(false); }
  }

  async function loadPosCompetencies(posId: string) {
    try {
      const r = await api.get(`/api/position-competencies/${posId}`);
      const d = r.data; setPosCompetencies(Array.isArray(d) ? d : d.competencies || []);
    } catch { setPosCompetencies([]); }
  }

  async function createCompetency() {
    if (!compForm.name || !compForm.category_id) return;
    await api.post('/api/competencies', compForm);
    setShowNewComp(false);
    loadAll();
  }

  async function createCycle() {
    if (!cycleForm.name || !cycleForm.period_start || !cycleForm.period_end) return;
    await api.post('/api/performance-cycles', cycleForm);
    setShowNewCycle(false);
    loadAll();
  }

  async function startCycle(id: number) {
    if (!confirm('¿Activar este ciclo? Se crearán evaluaciones para todos los empleados activos.')) return;
    await api.post(`/api/performance-cycles/${id}/start`);
    loadAll();
  }

  async function closeCycle(id: number) {
    if (!confirm('¿Cerrar este ciclo?')) return;
    try { await api.post(`/api/performance-cycles/${id}/close`); loadAll(); } catch {}
  }

  function fmtDate(val: string | null | undefined) {
    if (!val) return '-';
    return new Date(val).toLocaleDateString('es-PY');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <EnterprisePageHeader
        icon={Award}
        iconColor="bg-violet-700"
        title="Competencias y Desempeño"
        subtitle="Gestión de competencias, evaluaciones y desarrollo profesional"
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 flex-wrap">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === key
                ? 'bg-white border border-b-white text-violet-600 border-gray-200 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: COMPETENCIAS ── */}
      {tab === 'competencies' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">{competencies.length} competencias registradas</p>
            <button
              onClick={() => setShowNewComp(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
            >
              <Plus size={14} /> Nueva competencia
            </button>
          </div>
          {competencies.length === 0 && !loading ? (
            <EmptyState
              icon={Award}
              title="Sin competencias"
              description="Cree el catálogo de competencias de la organización"
              action={{ label: '+ Nueva competencia', onClick: () => setShowNewComp(true) }}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Nombre', 'Categoría', 'Tipo', 'Estado', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {competencies.map((c: any) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {categories.find(cat => cat.id === c.category_id)?.name || c.category_name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[c.competency_type] || 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABELS[c.competency_type] || c.competency_type || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status === 'active' ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-xs text-violet-600 hover:underline">Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CATEGORÍAS ── */}
      {tab === 'categories' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">{categories.length} categorías</p>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">
              <Plus size={14} /> Nueva categoría
            </button>
          </div>
          {categories.length === 0 && !loading ? (
            <EmptyState
              icon={Tag}
              title="Sin categorías"
              description="Organice las competencias en categorías para una mejor gestión"
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Nombre', 'Descripción', 'N° competencias', 'Estado'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {categories.map((cat: any) => {
                    const count = competencies.filter(c => c.category_id === cat.id).length;
                    return (
                      <tr key={cat.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{cat.description || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded text-xs font-medium">{count}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={cat.status === 'active' ? 'active' : 'inactive'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: NIVELES ── */}
      {tab === 'levels' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">{levels.length} niveles definidos</p>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">
              <Plus size={14} /> Nuevo nivel
            </button>
          </div>
          {levels.length === 0 && !loading ? (
            <EmptyState
              icon={BarChart2}
              title="Sin niveles definidos"
              description="Configure la escala de niveles para evaluar competencias"
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Nivel', 'Nombre', 'Descripción', 'Valor numérico'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {levels.map((l: any) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">
                          {l.level_number ?? l.level ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{l.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-sm truncate">{l.description || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-sm">{l.numeric_value ?? l.level_number ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CICLOS ── */}
      {tab === 'cycles' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowNewCycle(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
            >
              <Plus size={14} /> Nuevo ciclo
            </button>
          </div>
          {cycles.length === 0 && !loading ? (
            <EmptyState
              icon={RefreshCw}
              title="Sin ciclos de evaluación"
              description="Cree ciclos periódicos para gestionar las evaluaciones de desempeño"
              action={{ label: '+ Nuevo ciclo', onClick: () => setShowNewCycle(true) }}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Nombre', 'Período inicio', 'Período fin', 'Tipo', 'Estado', 'Evaluaciones', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cycles.map((c: any) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(c.period_start)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(c.period_end)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.cycle_type || c.type || '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={c.status === 'active' ? 'active' : c.status === 'closed' ? 'archived' : 'draft'}
                          label={c.status === 'active' ? 'Activo' : c.status === 'closed' ? 'Cerrado' : 'Borrador'}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{c.appraisal_count ?? c.evaluations_count ?? '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {c.status === 'draft' && (
                            <button onClick={() => startCycle(c.id)} className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                              <Play size={10} /> Activar
                            </button>
                          )}
                          {c.status === 'active' && (
                            <button onClick={() => closeCycle(c.id)} className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                              <XCircle size={10} /> Cerrar
                            </button>
                          )}
                          <a href={`/competencias/ciclo/${c.id}`} className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-50">
                            Ver
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: EVALUACIONES ── */}
      {tab === 'appraisals' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">{appraisals.length} evaluaciones</p>
            <a
              href="/competencias/evaluacion"
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
            >
              <Plus size={14} /> Nueva evaluación
            </a>
          </div>
          {appraisals.length === 0 && !loading ? (
            <EmptyState
              icon={ClipboardList}
              title="Sin evaluaciones"
              description="Las evaluaciones aparecerán aquí una vez activado un ciclo"
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Empleado', 'Evaluador', 'Plantilla', 'Período', 'Estado', 'Puntuación', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {appraisals.map((a: any) => {
                    const statusKey = a.status as string;
                    const statusCfg = APPRAISAL_STATUS[statusKey] ?? { label: statusKey, status: 'pending' };
                    return (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{a.employee_name || `Emp #${a.employee_id}`}</td>
                        <td className="px-4 py-3 text-gray-600">{a.evaluator_name || a.appraiser_name || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{a.template_name || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{a.period || (a.cycle_name ? a.cycle_name : '-')}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={statusCfg.status} label={statusCfg.label} />
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">
                          {a.total_score != null ? a.total_score.toFixed(1) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <a href={`/competencias/evaluacion/${a.id}`} className="text-xs text-violet-600 hover:underline">
                            Ver
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CAPACITACIÓN ── */}
      {tab === 'training' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">{trainings.length} formaciones en catálogo</p>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">
              <Plus size={14} /> Agregar formación
            </button>
          </div>
          {trainings.length === 0 && !loading ? (
            <EmptyState
              icon={BookOpen}
              title="Sin formaciones en catálogo"
              description="Agregue cursos y programas de capacitación al catálogo"
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Nombre', 'Proveedor', 'Duración (hs)', 'Modalidad', 'Costo (Gs.)', 'Estado'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {trainings.map((t: any) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{t.provider || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{t.duration_hours ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${MODALITY_COLORS[t.modality] || 'bg-gray-100 text-gray-600'}`}>
                          {t.modality || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {t.cost != null ? t.cost.toLocaleString('es-PY') : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status === 'active' ? 'active' : 'inactive'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: NUEVA COMPETENCIA ── */}
      {showNewComp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nueva Competencia</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select value={compForm.category_id} onChange={e => setCompForm(p => ({ ...p, category_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {(['code', 'name'] as const).map(f => (
                <div key={f}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f === 'code' ? 'Código' : 'Nombre *'}</label>
                  <input value={compForm[f]} onChange={e => setCompForm(p => ({ ...p, [f]: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={compForm.competency_type} onChange={e => setCompForm(p => ({ ...p, competency_type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(TYPE_LABELS).filter(([k]) => k === k.toUpperCase()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea value={compForm.description} onChange={e => setCompForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createCompetency} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">Crear</button>
              <button onClick={() => setShowNewComp(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVO CICLO ── */}
      {showNewCycle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Ciclo de Evaluación</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Ciclo</label>
                <input value={cycleForm.name} onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Evaluación Anual 2026" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inicio</label>
                  <input type="date" value={cycleForm.period_start} onChange={e => setCycleForm(p => ({ ...p, period_start: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
                  <input type="date" value={cycleForm.period_end} onChange={e => setCycleForm(p => ({ ...p, period_end: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createCycle} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">Crear Ciclo</button>
              <button onClick={() => setShowNewCycle(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
