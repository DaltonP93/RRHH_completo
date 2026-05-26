'use client';
import { api } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { FileCheck, Plus, Eye, Download } from 'lucide-react';
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

interface Constancia {
  id: number;
  employee_name: string;
  type: string;
  motivo?: string;
  issued_at: string;
  signed: boolean;
}

const CONSTANCIA_TYPES = [
  'Constancia de trabajo',
  'Constancia de ingresos',
  'Constancia de antigüedad',
  'Certificado IPS',
  'Liquidación',
];

export default function ConstanciasPage() {
  const [constancias, setConstancias] = useState<Constancia[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConstancias = useCallback(async () => {
    const res = await api.get('/api/documents?type=constancia').catch(() => ({ data: [] }));
    setConstancias(Array.isArray(res.data) ? res.data : []);
  }, []);

  useEffect(() => {
    fetchConstancias().finally(() => setLoading(false));
  }, [fetchConstancias]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <EnterprisePageHeader
        icon={FileCheck}
        iconColor="bg-emerald-600"
        title="Constancias Laborales"
        subtitle="Generación de certificados y constancias para empleados"
        breadcrumbs={[
          { label: 'Documentos', href: '/documentos' },
          { label: 'Constancias' },
        ]}
      />

      {/* Quick-generate button grid */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Generar nueva constancia</p>
        <div className="flex flex-wrap gap-2">
          {CONSTANCIA_TYPES.map(type => (
            <button
              key={type}
              disabled
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-500 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={14} /> {type}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : constancias.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="Sin constancias generadas"
          description="Las constancias y certificados laborales generados para los empleados aparecerán aquí."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Empleado', 'Tipo', 'Motivo', 'Fecha emisión', 'Firmado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {constancias.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.employee_name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.type}</td>
                  <td className="px-4 py-3 text-slate-500">{c.motivo || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {c.issued_at ? new Date(c.issued_at).toLocaleDateString('es') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={c.signed ? 'approved' : 'pending'}
                      label={c.signed ? 'Firmado' : 'Pendiente'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Descargar"
                      >
                        <Download size={14} />
                      </button>
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
