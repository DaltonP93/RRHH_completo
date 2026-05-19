'use client';
import { api, apiUrl } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Plus, X, Check, AlertCircle, Calculator, ThumbsUp, Lock, Download, Eye, RefreshCw } from 'lucide-react';


function formatGs(n: number | string | undefined | null) {
  const num = Number(n);
  if (isNaN(num) || n === null || n === undefined) return '—';
  return 'Gs. ' + num.toLocaleString('es-PY');
}

type RunStatus = 'draft' | 'calculating' | 'calculated' | 'review' | 'approved' | 'closed' | 'cancelled';

interface PayrollRun {
  id: number;
  period_year: number;
  period_month: number;
  period_start?: string;
  period_end?: string;
  settlement_type_id?: number;
  settlement_type_name?: string;
  status: RunStatus;
  employee_count?: number;
  total_gross?: number;
  total_ips?: number;
  total_net?: number;
  created_at?: string;
}

interface SettlementType {
  id: number;
  name: string;
  code?: string;
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const STATUS_CONFIG: Record<RunStatus, { label: string; cls: string }> = {
  draft:       { label: 'Borrador',   cls: 'bg-gray-100 text-gray-700' },
  calculating: { label: 'Calculando', cls: 'bg-blue-100 text-blue-700' },
  calculated:  { label: 'Calculado',  cls: 'bg-yellow-100 text-yellow-700' },
  review:      { label: 'En Revisión',cls: 'bg-orange-100 text-orange-700' },
  approved:    { label: 'Aprobado',   cls: 'bg-green-100 text-green-700' },
  closed:      { label: 'Cerrado',    cls: 'bg-purple-100 text-purple-700' },
  cancelled:   { label: 'Cancelado',  cls: 'bg-red-100 text-red-700' },
};

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function LiquidacionesPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [settlementTypes, setSettlementTypes] = useState<SettlementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // New run modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    period_year: currentYear, period_month: new Date().getMonth() + 1,
    period_start: '', period_end: '', settlement_type_id: '',
  });
  const [saving, setSaving] = useState(false);

  // Action states
  const [calculatingId, setCalculatingId] = useState<number | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<PayrollRun | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  useEffect(() => {
    fetchSettlementTypes();
    fetchRuns();
  }, []);

  useEffect(() => { fetchRuns(); }, [filterYear, filterMonth, filterStatus]);

  async function fetchRuns() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filterYear) params.set('year', filterYear);
      if (filterMonth) params.set('month', filterMonth);
      if (filterStatus) params.set('status', filterStatus);
      const res = await api.get(`/api/payroll-runs?${params}`);
      const data = res.data;
      setRuns(Array.isArray(data) ? data : data.data || []);
    } catch { setError('Error al cargar liquidaciones'); }
    finally { setLoading(false); }
  }

  async function fetchSettlementTypes() {
    try {
      const res = await api.get(`/api/settlement-types`);
      const data = res.data;
      setSettlementTypes(Array.isArray(data) ? data : data.data || []);
    } catch {}
  }

  async function createRun() {
    setSaving(true);
    try {
      await api.post('/api/payroll-runs', form);
      setShowModal(false);
      fetchRuns();
    } catch { alert('Error al crear liquidación'); }
    finally { setSaving(false); }
  }

  async function calculateRun(id: number) {
    setCalculatingId(id);
    try {
      await api.post(`/api/payroll-runs/${id}/calculate`);
      fetchRuns();
    } catch { alert('Error al calcular liquidación'); }
    finally { setCalculatingId(null); }
  }

  async function approveRun(id: number) {
    setApprovingId(id);
    try {
      await api.post(`/api/payroll-runs/${id}/approve`);
      setConfirmApprove(null);
      fetchRuns();
    } catch { alert('Error al aprobar liquidación'); }
    finally { setApprovingId(null); }
  }

  async function closeRun(id: number) {
    if (!confirm('¿Cerrar esta liquidación? Esta acción no se puede deshacer.')) return;
    try {
      await api.post(`/api/payroll-runs/${id}/close`);
      fetchRuns();
    } catch { alert('Error al cerrar liquidación'); }
  }

  function exportIPS(id: number) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || localStorage.getItem('token') : '';
    window.open(apiUrl(`/api/payroll-runs/${id}/export/ips?access_token=${token}`), '_blank');
  }

  function exportMTESS(id: number) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || localStorage.getItem('token') : '';
    window.open(apiUrl(`/api/payroll-runs/${id}/export/mtess?access_token=${token}`), '_blank');
  }

  function StatusBadge({ status }: { status: RunStatus }) {
    const cfg = STATUS_CONFIG[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Liquidaciones de Nómina</h1>
          <p className="text-sm text-gray-500">Gestión de liquidaciones mensuales y especiales</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Nueva Liquidación
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
          <option value="">Todos los años</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={fetchRuns} className="flex items-center gap-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
            Cargando...
          </div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Período</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Empleados</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Total Bruto</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Total IPS</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Total Neto</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">No hay liquidaciones</td></tr>
              )}
              {runs.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {MONTHS[(r.period_month || 1) - 1]} {r.period_year}
                    {r.period_start && <div className="text-xs text-gray-400">{r.period_start} — {r.period_end}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.settlement_type_name || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.employee_count ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatGs(r.total_gross)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatGs(r.total_ips)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatGs(r.total_net)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <a href={`/nomina/liquidaciones/${r.id}`}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
                        <Eye className="w-3 h-3" /> Ver
                      </a>
                      {(r.status === 'draft' || r.status === 'calculated') && (
                        <button onClick={() => calculateRun(r.id)} disabled={calculatingId === r.id}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-50 disabled:opacity-50">
                          {calculatingId === r.id
                            ? <div className="w-3 h-3 border border-indigo-600 border-t-transparent rounded-full animate-spin" />
                            : <Calculator className="w-3 h-3" />}
                          Calcular
                        </button>
                      )}
                      {(r.status === 'calculated' || r.status === 'review') && (
                        <button onClick={() => setConfirmApprove(r)}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 border border-green-200 rounded px-2 py-1 hover:bg-green-50">
                          <ThumbsUp className="w-3 h-3" /> Aprobar
                        </button>
                      )}
                      {r.status === 'approved' && (
                        <button onClick={() => closeRun(r.id)}
                          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 border border-purple-200 rounded px-2 py-1 hover:bg-purple-50">
                          <Lock className="w-3 h-3" /> Cerrar
                        </button>
                      )}
                      {(r.status === 'approved' || r.status === 'closed') && (
                        <>
                          <button onClick={() => exportIPS(r.id)}
                            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 border border-orange-200 rounded px-2 py-1 hover:bg-orange-50">
                            <Download className="w-3 h-3" /> IPS
                          </button>
                          <button onClick={() => exportMTESS(r.id)}
                            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 border border-teal-200 rounded px-2 py-1 hover:bg-teal-50">
                            <Download className="w-3 h-3" /> MTESS
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Run Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Nueva Liquidación</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Año *</label>
                  <select value={form.period_year} onChange={e => setForm(p => ({ ...p, period_year: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mes *</label>
                  <select value={form.period_month} onChange={e => setForm(p => ({ ...p, period_month: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                  <input type="date" value={form.period_start} onChange={e => setForm(p => ({ ...p, period_start: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                  <input type="date" value={form.period_end} onChange={e => setForm(p => ({ ...p, period_end: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Liquidación</label>
                <select value={form.settlement_type_id} onChange={e => setForm(p => ({ ...p, settlement_type_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="">Seleccionar tipo...</option>
                  {settlementTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={createRun} disabled={saving}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Approve Modal */}
      {confirmApprove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Confirmar Aprobación</h2>
            <p className="text-sm text-gray-600 mb-6">
              ¿Aprobar la liquidación de <strong>{MONTHS[(confirmApprove.period_month || 1) - 1]} {confirmApprove.period_year}</strong>?
              Esta acción no se puede revertir fácilmente.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmApprove(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={() => approveRun(confirmApprove.id)} disabled={!!approvingId}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {approvingId ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                Aprobar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
