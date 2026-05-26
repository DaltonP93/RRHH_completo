'use client'
import { useState, useEffect } from 'react'
import { FileText, Plus, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'

interface Contrato {
  id: number
  empleado: string
  tipo_contrato: string
  cargo: string
  fecha_inicio: string
  fecha_fin: string | null
  estado: string
}

/** Maps contract estado string to StatusBadge status key */
function contratoStatusKey(estado: string): string {
  const map: Record<string, string> = {
    activo:      'active',
    vencido:     'rejected',
    pendiente:   'pending',
    suspendido:  'inactive',
  }
  return map[estado?.toLowerCase()] ?? 'inactive'
}

function contratoStatusLabel(estado: string): string {
  const map: Record<string, string> = {
    activo:     'Activo',
    vencido:    'Vencido',
    pendiente:  'Pendiente',
    suspendido: 'Suspendido',
  }
  return map[estado?.toLowerCase()] ?? estado
}

export default function ContratosPage() {
  const [items, setItems] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/employee-contracts')
      .catch(() => ({ data: [] }))
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const vencidos = items.filter(i => i.estado?.toLowerCase() === 'vencido')

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <EnterprisePageHeader
        icon={FileText}
        iconColor="bg-slate-700"
        title="Contratos Laborales"
        subtitle="Períodos laborales activos y vencidos"
        breadcrumbs={[
          { label: 'Personas', href: '/empleados' },
          { label: 'Contratos' },
        ]}
        actions={
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus size={13} />
            Nuevo contrato
          </button>
        }
      />

      {/* Warning bar: vencidos */}
      {!loading && vencidos.length > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-medium">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span>
            {vencidos.length} {vencidos.length === 1 ? 'contrato vencido' : 'contratos vencidos'} — se recomienda renovación o archivo.
          </span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg skeleton-shimmer" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin contratos registrados"
              description="Los contratos se asignan al dar de alta un empleado"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo Contrato</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cargo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Inicio</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fin</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{item.tipo_contrato}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.cargo}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.fecha_inicio}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {item.fecha_fin ?? <span className="italic text-slate-400">Indefinido</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={contratoStatusKey(item.estado)}
                          label={contratoStatusLabel(item.estado)}
                          showDot
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
