'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, X, ChevronDown, ChevronRight, Users, DollarSign, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('access_token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function formatGs(n: number | string | undefined | null) {
  const num = Number(n);
  if (isNaN(num) || n === null || n === undefined) return '—';
  return 'Gs. ' + num.toLocaleString('es-PY');
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

type RunStatus = 'draft' | 'calculating' | 'calculated' | 'review' | 'approved' | 'closed' | 'cancelled';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:       { label: 'Borrador',   cls: 'bg-gray-100 text-gray-700' },
  calculating: { label: 'Calculando', cls: 'bg-blue-100 text-blue-700' },
  calculated:  { label: 'Calculado',  cls: 'bg-yellow-100 text-yellow-700' },
  review:      { label: 'En Revisión',cls: 'bg-orange-100 text-orange-700' },
  approved:    { label: 'Aprobado',   cls: 'bg-green-100 text-green-700' },
  closed:      { label: 'Cerrado',    cls: 'bg-purple-100 text-purple-700' },
  cancelled:   { label: 'Cancelado',  cls: 'bg-red-100 text-red-700' },
};

interface PayrollRun {
  id: number;
  period_year: number;
  period_month: number;
  period_start?: string;
  period_end?: string;
  settlement_type_name?: string;
  status: RunStatus;
  employee_count?: number;
  total_gross?: number;
  total_ips_employee?: number;
  total_ips_employer?: number;
  total_net?: number;
  created_at?: string;
}

interface EmployeeSettlement {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code?: string;
  days_worked?: number;
  base_salary?: number;
  total_income?: number;
  total_deductions?: number;
  total_ips?: number;
  net_amount?: number;
  status?: string;
  lines?: SettlementLine[];
}

interface SettlementLine {
  id: number;
  concept_name: string;
  concept_type: string;
  amount: number;
  is_ips?: boolean;
}

export default function LiquidacionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [run, setRun] = useState<PayrollRun | null>(null);
  const [settlements, setSettlements] = useState<EmployeeSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlementsLoading, setSettlementsLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [linesLoading, setLinesLoading] = useState<Record<number, boolean>>({});
  const [linesData, setLinesData] = useState<Record<number, SettlementLine[]>>({});
  const [showLinesModal, setShowLinesModal] = useState<EmployeeSettlement | null>(null);

  useEffect(() => {
    if (id) { fetchRun(); fetchSettlements(); }
  }, [id]);

  async function fetchRun() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll-runs/${id}`, { headers: authHeaders() });
      const data = await res.json();
      setRun(data);
    } catch { setError('Error al cargar liquidación'); }
    finally { setLoading(false); }
  }

  async function fetchSettlements() {
    setSettlementsLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll-runs/${id}/settlements`, { headers: authHeaders() });
      const data = await res.json();
      setSettlements(Array.isArray(data) ? data : data.data || []);
    } catch {}
    finally { setSettlementsLoading(false); }
  }

  async function fetchLines(settlementId: number) {
    if (linesData[settlementId]) return;
    setLinesLoading(prev => ({ ...prev, [settlementId]: true }));
    try {
      const res = await fetch(`${API}/api/payroll-runs/${id}/settlements/${settlementId}/lines`, { headers: authHeaders() });
      const data = await res.json();
      setLinesData(prev => ({ ...prev, [settlementId]: Array.isArray(data) ? data : data.data || [] }));
    } catch {
      setLinesData(prev => ({ ...prev, [settlementId]: [] }));
    } finally {
      setLinesLoading(prev => ({ ...prev, [settlementId]: false }));
    }
  }

  function toggleExpand(s: EmployeeSettlement) {
    if (expandedId === s.id) { setExpandedId(null); return; }
    setExpandedId(s.id);
    fetchLines(s.id);
  }

  function openLinesModal(s: EmployeeSettlement) {
    setShowLinesModal(s);
    fetchLines(s.id);
  }

  function exportCSV() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || localStorage.getItem('token') : '';
    window.open(`${API}/api/payroll-runs/${id}/export/csv?access_token=${token}`, '_blank');
  }

  function exportExcel() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || localStorage.getItem('token') : '';
    window.open(`${API}/api/payroll-runs/${id}/export/excel?access_token=${token}`, '_blank');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mr-3" />
        Cargando...
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <AlertCircle className="w-4 h-4" /> {error || 'Liquidación no encontrada'}
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[run.status] || { label: run.status, cls: 'bg-gray-100 text-gray-700' };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            Liquidación — {MONTHS[(run.period_month || 1) - 1]} {run.period_year}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.cls}`}>{statusCfg.label}</span>
            {run.settlement_type_name && <span className="text-sm text-gray-500">{run.settlement_type_name}</span>}
            {run.period_start && <span className="text-sm text-gray-400">{run.period_start} — {run.period_end}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Empleados', value: String(run.employee_count ?? '—'), icon: Users, color: 'blue' },
          { label: 'Total Bruto', value: formatGs(run.total_gross), icon: TrendingUp, color: 'green' },
          { label: 'IPS Obrero', value: formatGs(run.total_ips_employee), icon: TrendingDown, color: 'orange' },
          { label: 'IPS Patronal', value: formatGs(run.total_ips_employer), icon: TrendingDown, color: 'yellow' },
          { label: 'Total Neto', value: formatGs(run.total_net), icon: DollarSign, color: 'indigo' },
        ].map(card => {
          const Icon = card.icon;
          const colorMap: Record<string, string> = {
            blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
            orange: 'bg-orange-50 text-orange-600', yellow: 'bg-yellow-50 text-yellow-600',
            indigo: 'bg-indigo-50 text-indigo-600',
          };
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className={`inline-flex p-2 rounded-lg mb-2 ${colorMap[card.color]}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xs text-gray-500">{card.label}</div>
              <div className="font-semibold text-gray-900 mt-0.5 text-sm">{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* Settlements Table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Liquidaciones por Empleado</h2>
        </div>
        {settlementsLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
            Cargando...
          </div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Empleado</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Días</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Salario Base</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Ingresos</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Descuentos</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">IPS</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Neto</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Conceptos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {settlements.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">Sin liquidaciones de empleados</td></tr>
              )}
              {settlements.map(s => (
                <>
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => toggleExpand(s)} className="text-gray-400 hover:text-blue-600">
                        {expandedId === s.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{s.employee_name}</div>
                      {s.employee_code && <div className="text-xs text-gray-400">{s.employee_code}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{s.days_worked ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatGs(s.base_salary)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatGs(s.total_income)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{formatGs(s.total_deductions)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{formatGs(s.total_ips)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatGs(s.net_amount)}</td>
                    <td className="px-4 py-3">
                      {s.status && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.status === 'calculated' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {s.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openLinesModal(s)}
                        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
                        Ver Conceptos
                      </button>
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr key={`lines-${s.id}`}>
                      <td colSpan={10} className="bg-slate-50 px-8 py-3">
                        {linesLoading[s.id] ? (
                          <div className="text-slate-400 text-xs py-2">Cargando conceptos...</div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="py-1 text-left">Concepto</th>
                                <th className="py-1 text-left">Tipo</th>
                                <th className="py-1 text-right">Monto</th>
                                <th className="py-1 text-center">IPS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(linesData[s.id] || []).map(l => (
                                <tr key={l.id} className="border-t border-slate-100">
                                  <td className="py-1 text-slate-700">{l.concept_name}</td>
                                  <td className="py-1">
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                                      l.concept_type === 'INCOME' ? 'bg-green-100 text-green-700' :
                                      l.concept_type === 'DEDUCTION' ? 'bg-red-100 text-red-700' :
                                      l.concept_type === 'CONTRIBUTION' ? 'bg-blue-100 text-blue-700' :
                                      'bg-yellow-100 text-yellow-700'}`}>
                                      {l.concept_type === 'INCOME' ? 'Ingreso' :
                                       l.concept_type === 'DEDUCTION' ? 'Descuento' :
                                       l.concept_type === 'CONTRIBUTION' ? 'Aporte' : 'Provisión'}
                                    </span>
                                  </td>
                                  <td className={`py-1 text-right font-medium ${l.concept_type === 'INCOME' ? 'text-green-700' : 'text-red-600'}`}>
                                    {formatGs(l.amount)}
                                  </td>
                                  <td className="py-1 text-center">{l.is_ips ? '✓' : '—'}</td>
                                </tr>
                              ))}
                              {(linesData[s.id] || []).length === 0 && (
                                <tr><td colSpan={4} className="py-2 text-slate-400 text-center">Sin conceptos</td></tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lines Modal */}
      {showLinesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Conceptos — {showLinesModal.employee_name}</h2>
                <p className="text-sm text-gray-500">Detalle de ingresos y descuentos</p>
              </div>
              <button onClick={() => setShowLinesModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4">
              {linesLoading[showLinesModal.id] ? (
                <div className="text-center py-8 text-gray-400">Cargando...</div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Concepto</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Tipo</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Monto</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">IPS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(linesData[showLinesModal.id] || []).map(l => (
                        <tr key={l.id}>
                          <td className="px-3 py-2 text-gray-700">{l.concept_name}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              l.concept_type === 'INCOME' ? 'bg-green-100 text-green-700' :
                              l.concept_type === 'DEDUCTION' ? 'bg-red-100 text-red-700' :
                              l.concept_type === 'CONTRIBUTION' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'}`}>
                              {l.concept_type === 'INCOME' ? 'Ingreso' :
                               l.concept_type === 'DEDUCTION' ? 'Descuento' :
                               l.concept_type === 'CONTRIBUTION' ? 'Aporte' : 'Provisión'}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${l.concept_type === 'INCOME' ? 'text-green-700' : 'text-red-600'}`}>
                            {formatGs(l.amount)}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500">{l.is_ips ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 pt-4 border-t flex justify-between text-sm">
                    <div className="text-gray-500">Neto a pagar</div>
                    <div className="font-bold text-gray-900 text-base">{formatGs(showLinesModal.net_amount)}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
