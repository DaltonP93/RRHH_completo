'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Star, Plus, Filter } from 'lucide-react';

interface Appraisal {
  id: number; period_label?: string; status: string; final_score?: number;
  employee_name?: string; due_date?: string; created_at: string;
}

export default function EvaluacionesCompetenciasPage() {
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const url = statusFilter ? `/api/appraisals?status=${statusFilter}` : '/api/appraisals';
    api.get(url)
      .then(r => {
        const data = r.data?.data || r.data || [];
        setAppraisals(Array.isArray(data) ? data : []);
      })
      .catch(() => setAppraisals([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  const statusLabel: Record<string, string> = {
    pending: 'Pendiente', in_progress: 'En progreso',
    completed: 'Completada', cancelled: 'Cancelada',
  };

  const scoreColor = (s?: number) => {
    if (!s) return 'text-slate-400';
    if (s >= 4) return 'text-emerald-600 font-semibold';
    if (s >= 3) return 'text-amber-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Star size={20} className="text-slate-500" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Evaluaciones de Competencias</h1>
            <p className="text-xs text-slate-500">Evaluaciones 360° y por desempeño</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setLoading(true); }}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En progreso</option>
            <option value="completed">Completada</option>
          </select>
          <button className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={14} /> Nueva evaluación
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : appraisals.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <Star size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No hay evaluaciones registradas</p>
          <p className="text-xs text-slate-400 mt-1">Creá evaluaciones de desempeño para tus empleados</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Puntaje</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {appraisals.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{a.period_label || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{a.employee_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor[a.status] || 'bg-slate-100 text-slate-600'}`}>
                      {statusLabel[a.status] || a.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 ${scoreColor(a.final_score)}`}>
                    {a.final_score != null ? a.final_score.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {a.due_date ? new Date(a.due_date).toLocaleDateString('es-PY') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
