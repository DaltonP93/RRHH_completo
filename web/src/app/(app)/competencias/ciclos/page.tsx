'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'

interface Cycle {
  id: number
  nombre: string
  start_date: string
  end_date: string
  estado: 'active' | 'planning' | 'closed'
  empleados_evaluados: number
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Activo',       cls: 'bg-green-50 text-green-700' },
  planning: { label: 'Planificación', cls: 'bg-amber-50 text-amber-700' },
  closed:   { label: 'Cerrado',      cls: 'bg-slate-100 text-slate-500' },
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CiclosPage() {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/performance-cycles')
      .then(r => setCycles(r.data ?? []))
      .catch(() => setCycles([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-slate-500" />
          Ciclos de Desempeño
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Períodos formales de evaluación de competencias y desempeño
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ciclos registrados</span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : cycles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <RefreshCw className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay ciclos de desempeño configurados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Nombre', 'Período', 'Estado', 'Evaluados'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cycles.map(c => {
                const st = STATUS[c.estado] ?? { label: c.estado, cls: 'bg-slate-100 text-slate-500' }
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{c.nombre}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{fmt(c.start_date)} → {fmt(c.end_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{c.empleados_evaluados}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
