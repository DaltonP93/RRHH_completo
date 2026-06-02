'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { Star, Plus, Filter } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
const APPRAISAL_STATUS_MAP: Record<string, { status: string; label: string }> = {
  pending:     { status: 'pending',     label: 'Pendiente' },
  in_progress: { status: 'in_progress', label: 'En Progreso' },
  submitted:   { status: 'submitted',   label: 'Enviado' },
  calibrated:  { status: 'active',      label: 'Calibrado' },
};

const APPRAISAL_TYPE_COLORS: Record<string, string> = {
  self:         'bg-purple-50 text-purple-700 ring-purple-200',
  manager:      'bg-blue-50 text-blue-700 ring-blue-200',
  peer:         'bg-teal-50 text-teal-700 ring-teal-200',
  subordinate:  'bg-amber-50 text-amber-700 ring-amber-200',
};

const APPRAISAL_TYPE_LABELS: Record<string, string> = {
  self:         'Autoevaluación',
  manager:      'Superior',
  peer:         'Par',
  subordinate:  'Subordinado',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'submitted', label: 'Enviado' },
  { value: 'calibrated', label: 'Calibrado' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'self', label: 'Autoevaluación' },
  { value: 'manager', label: 'Superior' },
  { value: 'peer', label: 'Par' },
  { value: 'subordinate', label: 'Subordinado' },
];

// ── Component ──────────────────────────────────────────────────────────────
export default function Evaluaciones360Page() {
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => { loadAppraisals(); }, []);

  async function loadAppraisals() {
    setLoading(true);
    try {
      const r = await api.get('/api/appraisals').catch(() => ({ data: { ok: true, data: [], total: 0 } }));
      const d = r.data;
      const list = Array.isArray(d) ? d : (d?.data ?? []);
      setAppraisals(Array.isArray(list) ? list : []);
      setTotal(d?.total ?? list.length ?? 0);
    } finally { setLoading(false); }
  }

  // Derived stats
  const pending   = appraisals.filter(a => a.status === 'pending').length;
  const completed = appraisals.filter(a => a.status === 'submitted' || a.status === 'calibrated').length;
  const scores    = appraisals.filter(a => a.total_score != null).map(a => a.total_score as number);
  const avgScore  = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null;

  // Filtered list
  const filtered = appraisals.filter(a => {
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterType && a.appraisal_type !== filterType && a.type !== filterType) return false;
    return true;
  });

  function getType(a: any) {
    return a.appraisal_type || a.type || '';
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <EnterprisePageHeader
        icon={Star}
        iconColor="bg-amber-600"
        title="Evaluaciones 360°"
        subtitle="Evaluaciones de desempeño multi-fuente"
        breadcrumbs={[
          { label: 'Competencias', href: '/competencias' },
          { label: 'Evaluaciones 360°' },
        ]}
        actions={
          <button className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700">
            <Plus size={14} /> Nueva evaluación
          </button>
        }
      />

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total evaluaciones', value: total || appraisals.length, color: 'text-slate-700' },
          { label: 'Pendientes',         value: pending,   color: 'text-amber-600' },
          { label: 'Completadas',        value: completed, color: 'text-green-600' },
          { label: 'Score promedio',     value: avgScore != null ? avgScore.toFixed(1) : '—', color: 'text-blue-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 min-w-40"
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 min-w-40"
        >
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(filterStatus || filterType) && (
          <button onClick={() => { setFilterStatus(''); setFilterType(''); }} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {!loading && appraisals.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Sin evaluaciones registradas"
          description="Las evaluaciones 360° aparecerán aquí una vez iniciado un ciclo de desempeño"
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Empleado', 'Evaluador', 'Tipo', 'Período', 'Estado', 'Score', 'Plantilla', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td>
                </tr>
              )}
              {filtered.map((a: any) => {
                const type = getType(a);
                const statusCfg = APPRAISAL_STATUS_MAP[a.status] ?? { status: 'pending', label: a.status };
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {a.employee_name || `Emp #${a.employee_id}`}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {a.evaluator_name || a.appraiser_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {type ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${APPRAISAL_TYPE_COLORS[type] || 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                          {APPRAISAL_TYPE_LABELS[type] || type}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {a.period || a.cycle_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={statusCfg.status} label={statusCfg.label} />
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">
                      {a.total_score != null ? a.total_score.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {a.template_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/competencias/evaluacion/${a.id}`} className="text-xs text-amber-600 hover:underline">
                        Ver
                      </a>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && appraisals.length > 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No hay evaluaciones con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
