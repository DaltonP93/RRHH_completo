'use client';
import { api } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck } from 'lucide-react';
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader';
import EmptyState from '@/components/ui/EmptyState';

interface AuditEntry {
  id: number;
  created_at: string;
  user_name?: string;
  action: string;
  document_title?: string;
  ip?: string;
  result?: string;
}

const ACTION_CONFIG: Record<string, { label: string; cls: string }> = {
  visto:       { label: 'Visto',       cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  firmado:     { label: 'Firmado',     cls: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
  editado:     { label: 'Editado',     cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  eliminado:   { label: 'Eliminado',   cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  descargado:  { label: 'Descargado',  cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' },
};

const ALL_ACTIONS = Object.keys(ACTION_CONFIG);

export default function AuditoriaDocumentalPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser]   = useState('');
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo, setFilterTo]       = useState('');

  const fetchAudit = useCallback(async () => {
    const res = await api.get('/api/document-audit').catch(() => ({ data: [] }));
    setEntries(Array.isArray(res.data) ? res.data : []);
  }, []);

  useEffect(() => {
    fetchAudit().finally(() => setLoading(false));
  }, [fetchAudit]);

  const filtered = entries.filter(e => {
    if (filterAction && e.action !== filterAction) return false;
    if (filterUser && !e.user_name?.toLowerCase().includes(filterUser.toLowerCase())) return false;
    if (filterFrom) {
      const d = new Date(e.created_at);
      if (d < new Date(filterFrom)) return false;
    }
    if (filterTo) {
      const d = new Date(e.created_at);
      if (d > new Date(filterTo + 'T23:59:59')) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <EnterprisePageHeader
        icon={ShieldCheck}
        iconColor="bg-slate-700"
        title="Auditoría Documental"
        subtitle="Registro de accesos, firmas y cambios en documentos"
        breadcrumbs={[
          { label: 'Documentos', href: '/documentos' },
          { label: 'Auditoría' },
        ]}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
        >
          <option value="">Todas las acciones</option>
          {ALL_ACTIONS.map(a => (
            <option key={a} value={a}>{ACTION_CONFIG[a].label}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filtrar por usuario..."
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 w-48"
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Desde</label>
          <input
            type="date"
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Hasta</label>
          <input
            type="date"
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
          />
        </div>

        {(filterAction || filterUser || filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterAction(''); setFilterUser(''); setFilterFrom(''); setFilterTo(''); }}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Sin eventos de auditoría"
          description="Los eventos de acceso, firma y modificación de documentos aparecerán aquí."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Fecha', 'Usuario', 'Acción', 'Documento', 'IP', 'Resultado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(entry => {
                const actionCfg = ACTION_CONFIG[entry.action] ?? { label: entry.action, cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' };
                return (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString('es')}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.user_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionCfg.cls}`}>
                        {actionCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{entry.document_title || '-'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{entry.ip || '-'}</td>
                    <td className="px-4 py-3">
                      {entry.result ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          entry.result === 'ok' || entry.result === 'success'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {entry.result}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            {filtered.length} evento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
