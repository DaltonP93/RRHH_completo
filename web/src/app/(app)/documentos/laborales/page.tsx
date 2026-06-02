'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Briefcase, FileText, Eye } from 'lucide-react';
import Link from 'next/link';

interface Doc { id: number; title: string; status: string; employee_name?: string; created_at: string }

const LABOR_MODULES = ['contrato', 'constancia', 'liquidacion', 'preaviso', 'vacaciones', 'permiso'];

export default function DocumentosLaboralesPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('');

  useEffect(() => {
    const url = activeModule ? `/api/documents?module=${activeModule}` : '/api/documents';
    api.get(url)
      .then(r => setDocs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [activeModule]);

  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600', pending: 'bg-amber-100 text-amber-700',
    sent: 'bg-blue-100 text-blue-700', signed: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <Briefcase size={20} className="text-slate-500" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Documentos Laborales</h1>
          <p className="text-xs text-slate-500">Contratos, constancias y documentos generados por nómina</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveModule('')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!activeModule ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Todos
        </button>
        {LABOR_MODULES.map(m => (
          <button
            key={m}
            onClick={() => setActiveModule(m)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${activeModule === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <FileText size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No hay documentos laborales{activeModule ? ` del tipo "${activeModule}"` : ''}</p>
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
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.title}</td>
                  <td className="px-4 py-3 text-slate-600">{d.employee_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor[d.status] || 'bg-slate-100 text-slate-600'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(d.created_at).toLocaleDateString('es-PY')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/documentos/${d.id}`} className="text-blue-600 hover:text-blue-700"><Eye size={14} /></Link>
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
