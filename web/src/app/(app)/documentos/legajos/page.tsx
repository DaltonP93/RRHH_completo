'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, Search, Eye } from 'lucide-react';
import Link from 'next/link';

interface Employee { id: number; first_name: string; last_name: string; document_number?: string; department?: string; doc_count?: number }

export default function LegajosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/api/employees?status=active&limit=200')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.data || []);
        setEmployees(list);
      })
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter(e =>
    !search ||
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (e.document_number || '').includes(search)
  );

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <FileText size={20} className="text-slate-500" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Legajos de Personal</h1>
          <p className="text-xs text-slate-500">Carpeta digital de documentos por empleado</p>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar empleado..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <FileText size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No se encontraron empleados</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">CI</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Departamento</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{e.first_name} {e.last_name}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{e.document_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{e.department || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/documentos?employee_id=${e.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Eye size={12} /> Ver legajo
                    </Link>
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
