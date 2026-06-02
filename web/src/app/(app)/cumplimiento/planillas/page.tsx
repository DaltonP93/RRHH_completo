'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ClipboardList, Plus, CheckCircle } from 'lucide-react';

interface Planilla { id: number; name: string; period_year: number; period_month: number; type?: string; status: string; submitted_at?: string }

export default function PlanillasPage() {
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/compliance/labor-planillas')
      .then(r => setPlanillas(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPlanillas([]))
      .finally(() => setLoading(false));
  }, []);

  const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    submitted: 'bg-blue-100 text-blue-700',
    accepted: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList size={20} className="text-slate-500" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Planillas Laborales</h1>
            <p className="text-xs text-slate-500">Planillas mensuales y anuales para MTESS/IPS</p>
          </div>
        </div>
        <button className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={14} /> Nueva planilla
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : planillas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <ClipboardList size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No hay planillas laborales registradas</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {planillas.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 font-mono text-xs">
                    {MONTHS[(p.period_month || 1) - 1]}/{p.period_year}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{p.type || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor[p.status] || 'bg-slate-100 text-slate-600'}`}>
                      {p.status === 'draft' ? 'Borrador' : p.status === 'submitted' ? 'Presentada' : 'Aceptada'}
                    </span>
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
