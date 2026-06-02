'use client'
import { useState, useEffect } from 'react'
import { Scale, Plus, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

interface Retencion {
  id: number
  empleado: string
  expediente: string
  tipo_retencion: string
  porcentaje?: number
  monto_fijo?: number
  fecha_desde: string
  fecha_hasta: string
  estado: string
  juzgado: string
}

const STATUS_MAP: Record<string, string> = {
  activa:      'error',
  suspendida:  'pending',
  finalizada:  'inactive',
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMontoOPct(item: Retencion) {
  if (item.porcentaje != null) return `${item.porcentaje}%`
  if (item.monto_fijo != null) return 'Gs. ' + item.monto_fijo.toLocaleString('es-PY')
  return '—'
}

export default function RetencionesPage() {
  const [items, setItems]     = useState<Retencion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.any([
      api.get('/api/judicial-retentions').then(r => r.data),
      api.get('/api/salary-retentions').then(r => r.data),
    ])
      .then(d => setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-5">
      <EnterprisePageHeader
        icon={Scale}
        iconColor="bg-red-700"
        title="Retenciones Judiciales"
        subtitle="Embargos y retenciones sobre salario por orden judicial"
        breadcrumbs={[
          { label: 'Nómina', href: '/nomina' },
          { label: 'Retenciones Judiciales' },
        ]}
        actions={
          <button className="inline-flex items-center gap-2 px-3 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-medium rounded-lg transition-colors">
            <Plus size={14} />
            Registrar retención
          </button>
        }
      />

      {/* Warning banner */}
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
        <p className="text-xs text-red-800 leading-relaxed">
          <span className="font-semibold">Límite legal:</span> la retención judicial no puede superar el 30% del salario neto (Art. 241 CT PY).
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Cargando...</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="Sin retenciones judiciales registradas"
            description="No hay órdenes de retención judicial activas sobre el personal."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Expediente</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo retención</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">% o Monto fijo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Desde</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hasta</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Juzgado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-mono">{item.expediente || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.tipo_retencion || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">{fmtMontoOPct(item)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(item.fecha_desde)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(item.fecha_hasta)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={STATUS_MAP[item.estado] ?? item.estado} label={item.estado} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{item.juzgado || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
