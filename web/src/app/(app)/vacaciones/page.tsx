'use client'
import { useState, useEffect } from 'react'
import { Plane, Plus, Info } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

interface Vacation {
  id: number
  empleado: string
  periodo: string
  dias_solicitados: number
  dias_disponibles: number
  fecha_inicio: string
  fecha_fin: string
  estado: string
}

const TABS = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'aprobadas',  label: 'Aprobadas' },
  { key: 'historial',  label: 'Historial' },
]

const STATUS_MAP: Record<string, string> = {
  solicitado: 'pending',
  aprobado:   'approved',
  rechazado:  'rejected',
  tomado:     'generated',
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function VacacionesPage() {
  const [items, setItems]   = useState<Vacation[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]       = useState('pendientes')

  useEffect(() => {
    Promise.any([
      api.get('/api/vacations').then(r => r.data),
      api.get('/api/employee-vacations').then(r => r.data),
    ])
      .then(d => setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter(v => {
    if (tab === 'pendientes') return v.estado === 'solicitado'
    if (tab === 'aprobadas')  return v.estado === 'aprobado'
    return true
  })

  return (
    <div className="p-6 space-y-5">
      <EnterprisePageHeader
        icon={Plane}
        iconColor="bg-blue-600"
        title="Vacaciones"
        subtitle="Gestión de vacaciones según Art. 219 Código del Trabajo PY"
        breadcrumbs={[
          { label: 'Nómina', href: '/nomina' },
          { label: 'Vacaciones' },
        ]}
        actions={
          <button className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
            <Plus size={14} />
            Nueva solicitud
          </button>
        }
      />

      {/* Info Banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-relaxed">
          <span className="font-semibold">Según Art. 219 CT PY:</span> 12 días hábiles para &lt;5 años, 18 días para 5-10 años, 30 días para &gt;10 años de servicio.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Plane}
            title="Sin solicitudes de vacaciones"
            description="No hay solicitudes de vacaciones para este filtro."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Días solic.</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Días dispon.</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Inicio</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fin</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.periodo || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-center">{item.dias_solicitados ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-center">{item.dias_disponibles ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(item.fecha_inicio)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(item.fecha_fin)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={STATUS_MAP[item.estado] ?? item.estado} label={item.estado} />
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs text-blue-600 hover:underline">Ver</button>
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
