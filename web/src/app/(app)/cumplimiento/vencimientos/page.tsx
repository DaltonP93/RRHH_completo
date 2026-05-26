'use client'
import { useState, useEffect } from 'react'
import { Calendar, Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'

interface Deadline {
  id?: number
  fecha: string
  obligacion: string
  entidad: 'MTESS' | 'IPS'
  estado?: string
}

// Static Paraguay MTESS/IPS deadlines fallback
function buildStaticDeadlines(): Deadline[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-based

  const deadlines: Deadline[] = []

  // Generate for current and next 3 months
  for (let m = 0; m < 4; m++) {
    const d = new Date(year, month + m, 1)
    const y = d.getFullYear()
    const mo = d.getMonth() + 1
    const pad = (n: number) => String(n).padStart(2, '0')

    deadlines.push({
      fecha: `${y}-${pad(mo)}-10`,
      obligacion: 'Aporte patronal IPS – mes anterior',
      entidad: 'IPS',
    })
    deadlines.push({
      fecha: `${y}-${pad(mo)}-15`,
      obligacion: 'Planilla mensual MTESS',
      entidad: 'MTESS',
    })
    deadlines.push({
      fecha: `${y}-${pad(mo)}-05`,
      obligacion: 'REOP – Altas/Bajas dentro de 5 días del hecho',
      entidad: 'MTESS',
    })
    deadlines.push({
      fecha: `${y}-${pad(mo)}-30`,
      obligacion: 'REI IPS – Alta de empleado (30 días del ingreso)',
      entidad: 'IPS',
    })
  }

  return deadlines.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

function diasRestantes(fechaStr: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fecha = new Date(fechaStr + 'T00:00:00')
  return Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function groupByMonth(items: Deadline[]): { monthLabel: string; items: Deadline[] }[] {
  const map = new Map<string, Deadline[]>()
  for (const item of items) {
    const d = new Date(item.fecha + 'T00:00:00')
    const key = d.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.entries()).map(([monthLabel, items]) => ({ monthLabel, items }))
}

export default function VencimientosPage() {
  const [items, setItems] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/compliance/deadlines')
      .then(r => {
        const d = r.data
        const arr = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.deadlines) ? d.deadlines : []))
        setItems(arr.length > 0 ? arr : buildStaticDeadlines())
      })
      .catch(() => setItems(buildStaticDeadlines()))
      .finally(() => setLoading(false))
  }, [])

  const grouped = groupByMonth(items)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <EnterprisePageHeader
        icon={Calendar}
        iconColor="bg-amber-600"
        title="Calendario de Vencimientos"
        subtitle="Fechas límite de obligaciones MTESS e IPS"
        breadcrumbs={[
          { label: 'Cumplimiento Legal', href: '/cumplimiento' },
          { label: 'Vencimientos' },
        ]}
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Vence en ≤5 días</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Vence en ≤15 días</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Más de 15 días</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Vencido</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-300" size={28} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Sin vencimientos registrados"
          description="No hay fechas límite de obligaciones registradas para el período actual."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.monthLabel}>
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3 capitalize">
                {group.monthLabel}
              </h2>
              <div className="space-y-2">
                {group.items.map((item, idx) => {
                  const dias = diasRestantes(item.fecha)
                  const vencido = dias < 0
                  const urgente = !vencido && dias <= 5
                  const proximo = !vencido && dias <= 15 && dias > 5
                  const ok = !vencido && dias > 15

                  const dotCls = vencido ? 'bg-slate-300' : urgente ? 'bg-red-500' : proximo ? 'bg-amber-400' : 'bg-emerald-500'
                  const rowCls = vencido
                    ? 'bg-slate-50 border-slate-200'
                    : urgente
                    ? 'bg-red-50 border-red-200'
                    : proximo
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-slate-100'

                  const DaysIcon = vencido ? CheckCircle : urgente || proximo ? AlertTriangle : Clock
                  const daysCls = vencido ? 'text-slate-400' : urgente ? 'text-red-600' : proximo ? 'text-amber-600' : 'text-emerald-600'
                  const daysLabel = vencido
                    ? 'Vencido'
                    : dias === 0
                    ? 'Hoy'
                    : dias === 1
                    ? '1 día'
                    : `${dias} días`

                  const fecha = new Date(item.fecha + 'T00:00:00').toLocaleDateString('es-PY', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })

                  return (
                    <div key={idx} className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${rowCls}`}>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotCls}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 leading-tight">{item.obligacion}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{fecha}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ring-1 flex-shrink-0 ${
                        item.entidad === 'IPS'
                          ? 'bg-teal-50 text-teal-700 ring-teal-200'
                          : 'bg-blue-50 text-blue-700 ring-blue-200'
                      }`}>
                        {item.entidad}
                      </span>
                      <div className={`flex items-center gap-1 flex-shrink-0 ${daysCls}`}>
                        <DaysIcon size={12} />
                        <span className="text-xs font-semibold">{daysLabel}</span>
                      </div>
                      {item.estado && (
                        <span className="text-xs text-slate-400 flex-shrink-0">{item.estado}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
