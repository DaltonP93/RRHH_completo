'use client'

import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { api } from '@/lib/api'

interface Plan {
  id: number
  nombre: string
  modalidad: string
  duracion_horas: number
  participantes: number
}

export default function CapacitacionPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/training-plans')
      .then(r => setPlans(r.data ?? []))
      .catch(() =>
        api.get('/api/courses')
          .then(r => setPlans(r.data ?? []))
          .catch(() => setPlans([]))
      )
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-slate-500" />
          Capacitación y Desarrollo
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Planes de capacitación y formación continua del personal
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Programas activos</span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <GraduationCap className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay planes de capacitación registrados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Nombre', 'Modalidad', 'Duración (hs)', 'Participantes'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{p.nombre}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">{p.modalidad}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{p.duracion_horas} h</td>
                  <td className="px-4 py-2.5 text-slate-600">{p.participantes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
