'use client'
import { useState, useEffect } from 'react'
import { UserMinus, Plus, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

interface Preaviso {
  id: number
  empleado: string
  tipo_egreso: string
  fecha_notificacion: string
  dias_preaviso: number
  fecha_efectiva: string
  monto_indemnizacion: number
  estado: string
}

const STATUS_MAP: Record<string, string> = {
  notificado:  'generated',
  'en-curso':  'pending',
  finalizado:  'approved',
  rescindido:  'rejected',
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtGs(n?: number) {
  if (n == null) return '—'
  return 'Gs. ' + n.toLocaleString('es-PY')
}

export default function PreavísosPage() {
  const [items, setItems]     = useState<Preaviso[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.any([
      api.get('/api/payroll-notices').then(r => r.data),
      api.get('/api/termination-notices').then(r => r.data),
    ])
      .then(d => setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-5">
      <EnterprisePageHeader
        icon={UserMinus}
        iconColor="bg-slate-700"
        title="Preavisos de Desvinculación"
        subtitle="Notificaciones de egreso según Código del Trabajo PY"
        breadcrumbs={[
          { label: 'Nómina', href: '/nomina' },
          { label: 'Preavisos' },
        ]}
        actions={
          <button className="inline-flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors">
            <Plus size={14} />
            Registrar preaviso
          </button>
        }
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          <span className="font-semibold">Preaviso legal Paraguay:</span> mínimo 30 días para contratos con más de 1 año de antigüedad (Art. 87 CT).
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Cargando...</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={UserMinus}
            title="Sin preavisos registrados"
            description="No hay preavisos de desvinculación registrados. Se crean al iniciar un proceso de egreso."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo egreso</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha notif.</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Días preaviso</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha efectiva</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Indemnización</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{item.tipo_egreso || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(item.fecha_notificacion)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-center">{item.dias_preaviso ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(item.fecha_efectiva)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">{fmtGs(item.monto_indemnizacion)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={STATUS_MAP[item.estado] ?? item.estado} label={item.estado} />
                    </td>
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
