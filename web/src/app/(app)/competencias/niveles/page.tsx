'use client'

import { useEffect, useState } from 'react'
import { AlignLeft, Info } from 'lucide-react'
import { api } from '@/lib/api'

interface Level {
  id: number
  nivel: number
  nombre: string
  descripcion: string
  rango_min: number
  rango_max: number
}

export default function NivelesPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/competency-levels')
      .then(r => setLevels(r.data ?? []))
      .catch(() => setLevels([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <AlignLeft className="w-5 h-5 text-slate-500" />
          Niveles de Competencia
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Escala de valoración para evaluar el dominio de cada competencia
        </p>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">Los niveles 1–5 son los más comunes en evaluaciones 360°</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Escala de niveles</span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : levels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <AlignLeft className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay niveles configurados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Nivel', 'Nombre', 'Descripción', 'Rango mín.', 'Rango máx.'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {levels.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex w-6 h-6 items-center justify-center bg-slate-100 text-slate-700 rounded text-xs font-bold">{l.nivel}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{l.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">{l.descripcion}</td>
                  <td className="px-4 py-2.5 text-slate-600">{l.rango_min}</td>
                  <td className="px-4 py-2.5 text-slate-600">{l.rango_max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
