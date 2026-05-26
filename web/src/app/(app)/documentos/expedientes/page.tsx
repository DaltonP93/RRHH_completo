'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FolderOpen, Search, Eye, Download } from 'lucide-react';
import Link from 'next/link';

interface Doc {
  id: number; title: string; status: string; module: string;
  employee_name?: string; created_at: string;
}

export default function ExpedientesPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/api/documents?module=expediente')
      .then(r => setDocs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.employee_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusLabel: Record<string, string> = {
    draft: 'Borrador', pending: 'Pendiente', sent: 'Enviado',
    viewed: 'Visto', signed: 'Firmado', cancelled: 'Cancelado',
  };
  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600', pending: 'bg-amber-100 text-amber-700',
    sent: 'bg-blue-100 text-blue-700', viewed: 'bg-purple-100 text-purple-700',
    signed: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-600',
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <FolderOpen size={20} className="text-slate-500" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Expedientes Digitales</h1>
          <p className="text-xs text-slate-500">Documentos oficiales digitalizados de empleados</p>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título o empleado..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <FolderOpen size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No hay expedientes digitales registrados</p>
          <p className="text-xs text-slate-400 mt-1">Los expedientes se generan desde el módulo de Documentos</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Título</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.title}</td>
                  <td className="px-4 py-3 text-slate-600">{d.employee_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor[d.status] || 'bg-slate-100 text-slate-600'}`}>
                      {statusLabel[d.status] || d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(d.created_at).toLocaleDateString('es-PY')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Link href={`/documentos/${d.id}`} className="text-blue-600 hover:text-blue-700">
                        <Eye size={14} />
                      </Link>
                    </div>
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
