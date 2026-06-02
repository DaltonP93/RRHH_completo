'use client'

import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
import { api } from '@/lib/api'

interface Deadline {
  id: number
  tipo: 'MTESS' | 'IPS'
  descripcion: string
  fecha: string
}

interface CalendarData {
  deadlines: Deadline[]
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

function groupByMonth(deadlines: Deadline[]) {
  return deadlines.reduce<Record<string, Deadline[]>>((acc, d) => {
    const month = d.fecha.slice(0, 7)
    ;(acc[month] ??= []).push(d)
    return acc
  }, {})
}

export default function CalendarioPage() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/compliance/calendar?company_id=1')
      .then(r => setDeadlines((r.data as CalendarData)?.deadlines ?? []))
      .catch(() => setDeadlines([]))
      .finally(() => setLoading(false))
  }, [])

  const grouped = groupByMonth(deadlines)

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-500" />
          Calendario de Vencimientos
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Fechas límite para presentaciones ante MTESS e IPS
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
        </div>
      ) : deadlines.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center py-14 text-slate-400">
          <Calendar className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No hay vencimientos próximos</p>
        </div>
      ) : (
        Object.entries(grouped).sort().map(([month, items]) => (
          <div key={month} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {new Date(month + '-01').toLocaleDateString('es-PY', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map(d => {
                const days = daysUntil(d.fecha)
                const urgent = days <= 7
                return (
                  <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${d.tipo === 'MTESS' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {d.tipo}
                      </span>
                      <span className="text-sm text-slate-700">{d.descripcion}</span>
                    </div>
                    <span className={`text-sm font-medium ${urgent ? 'text-red-600' : 'text-slate-500'}`}>
                      {new Date(d.fecha).toLocaleDateString('es-PY')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
