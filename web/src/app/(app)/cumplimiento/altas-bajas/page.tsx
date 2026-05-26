'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { UserPlus, UserMinus, Filter } from 'lucide-react';

interface MtessComm {
  id: number; communication_type: string; employee_name?: string;
  effective_date?: string; status: string; created_at: string; reference_number?: string;
}

const TYPE_LABEL: Record<string, string> = {
  ALTA: 'Alta', BAJA: 'Baja', VACACIONES: 'Vacaciones', PERMISO: 'Permiso',
  SUSPENSION: 'Suspensión', ACCIDENTE: 'Accidente',
};
const TYPE_COLOR: Record<string, string> = {
  ALTA: 'bg-emerald-100 text-emerald-700', BAJA: 'bg-red-100 text-red-700',
  VACACIONES: 'bg-blue-100 text-blue-700', PERMISO: 'bg-amber-100 text-amber-700',
  SUSPENSION: 'bg-orange-100 text-orange-700', ACCIDENTE: 'bg-rose-100 text-rose-700',
};

export default function AltasBajasPage() {
  const [records, setRecords] = useState<MtessComm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const url = filter ? `/api/compliance/mtess?type=${filter}` : '/api/compliance/mtess';
    api.get(url)
      .then(r => setRecords(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex">
            <UserPlus size={18} className="text-emerald-500" />
            <UserMinus size={18} className="text-red-500 -ml-1" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Altas y Bajas MTESS</h1>
            <p className="text-xs text-slate-500">Comunicaciones enviadas al MTESS/REOP</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={filter} onChange={e => { setFilter(e.target.value); setLoading(true); }}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <UserPlus size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No hay comunicaciones MTESS registradas</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vigencia</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ref.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${TYPE_COLOR[r.communication_type] || 'bg-slate-100 text-slate-600'}`}>
                      {TYPE_LABEL[r.communication_type] || r.communication_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.employee_name || '(Global)'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {r.effective_date ? new Date(r.effective_date).toLocaleDateString('es-PY') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      r.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      r.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {r.status === 'pending' ? 'Pendiente' : r.status === 'submitted' ? 'Enviado' :
                       r.status === 'accepted' ? 'Aceptado' : 'Rechazado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{r.reference_number || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
