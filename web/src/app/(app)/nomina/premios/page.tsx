'use client'
import { useState, useEffect } from 'react'
import { Gift, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

interface Bonus {
  id: number
  empleado: string
  tipo_premio: string
  monto: number
  periodo: string
  motivo: string
  estado: string
  registrado_por: string
}

const STATUS_MAP: Record<string, string> = {
  pendiente:  'pending',
  aprobado:   'approved',
  pagado:     'generated',
  cancelado:  'inactive',
}

function fmtGs(n?: number) {
  if (n == null) return '—'
  return 'Gs. ' + n.toLocaleString('es-PY')
}

export default function PremiosPage() {
  const [items, setItems]     = useState<Bonus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.any([
      api.get('/api/payroll-bonuses').then(r => r.data),
      api.get('/api/salary-bonuses').then(r => r.data),
    ])
      .then(d => setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const totalMes = items.reduce((acc, i) => acc + (i.monto || 0), 0)

  return (
    <div className="p-6 space-y-5">
      <EnterprisePageHeader
        icon={Gift}
        iconColor="bg-amber-600"
        title="Premios y Bonificaciones"
        subtitle="Reconocimientos y bonos adicionales a la nómina"
        breadcrumbs={[
          { label: 'Nómina', href: '/nomina' },
          { label: 'Premios' },
        ]}
        actions={
          <button className="inline-flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors">
            <Plus size={14} />
            Registrar premio
          </button>
        }
      />

      {/* Summary strip */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-medium text-amber-800">Total bonificaciones del período</span>
        <span className="text-sm font-bold text-amber-900">{fmtGs(totalMes)}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Cargando...</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="Sin premios registrados"
            description="No hay premios ni bonificaciones registrados para el período actual."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo premio</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monto</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Motivo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Registrado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{item.tipo_premio || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">{fmtGs(item.monto)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.periodo || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">{item.motivo || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={STATUS_MAP[item.estado] ?? item.estado} label={item.estado} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{item.registrado_por || '—'}</td>
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
