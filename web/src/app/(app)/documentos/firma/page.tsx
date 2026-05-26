'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { PenLine, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Doc {
  id: number; title: string; status: string;
  employee_name?: string; created_at: string; template_name?: string;
}

export default function FirmaPage() {
  const [pending, setPending] = useState<Doc[]>([]);
  const [signed, setSigned] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/documents?status=pending'),
      api.get('/api/documents?status=signed'),
    ])
      .then(([r1, r2]) => {
        setPending(Array.isArray(r1.data) ? r1.data : []);
        setSigned(Array.isArray(r2.data) ? r2.data : []);
      })
      .catch(() => { setPending([]); setSigned([]); })
      .finally(() => setLoading(false));
  }, []);

  const Row = ({ doc }: { doc: Doc }) => (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 font-medium text-slate-800">{doc.title}</td>
      <td className="px-4 py-3 text-slate-600">{doc.employee_name || '—'}</td>
      <td className="px-4 py-3 text-slate-500 text-xs">{doc.template_name || '—'}</td>
      <td className="px-4 py-3 text-slate-500 text-xs">
        {new Date(doc.created_at).toLocaleDateString('es-PY')}
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={`/documentos/${doc.id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          Abrir →
        </Link>
      </td>
    </tr>
  );

  const TableHead = () => (
    <thead>
      <tr className="border-b border-slate-100 bg-slate-50">
        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Documento</th>
        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Plantilla</th>
        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
        <th className="px-4 py-2.5" />
      </tr>
    </thead>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <PenLine size={20} className="text-slate-500" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Firma Electrónica</h1>
          <p className="text-xs text-slate-500">Documentos pendientes y firmados</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <>
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-700">Pendientes de firma ({pending.length})</h2>
            </div>
            {pending.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
                <CheckCircle size={24} className="mx-auto text-emerald-400 mb-2" />
                <p className="text-sm text-slate-500">Sin documentos pendientes de firma</p>
              </div>
            ) : (
              <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <TableHead />
                  <tbody className="divide-y divide-slate-50">{pending.map(d => <Row key={d.id} doc={d} />)}</tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={14} className="text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-700">Firmados recientemente ({signed.slice(0, 20).length})</h2>
            </div>
            {signed.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
                <p className="text-sm text-slate-500">No hay documentos firmados</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <TableHead />
                  <tbody className="divide-y divide-slate-50">{signed.slice(0, 20).map(d => <Row key={d.id} doc={d} />)}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
