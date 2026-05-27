'use client'

import { useEffect, useState } from 'react'
import { BookMarked } from 'lucide-react'
import { api } from '@/lib/api'

interface SettlementType {
  id: number
  nombre: string
  codigo: string
  descripcion: string
  estado: 'active' | 'inactive'
}

export default function CausasPage() {
  const [types, setTypes] = useState<SettlementType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/settlement-types')
      .then(r => setTypes(r.data ?? []))
      .catch(() => setTypes([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-slate-500" />
          Causales de Egreso
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Catálogo de causales legales para la liquidación de salida
        </p>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
        <BookMarked className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">
          Art. 81 Código del Trabajo PY — Causales de terminación del contrato
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Causales registradas
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : types.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <BookMarked className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay causales configuradas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Nombre', 'Código', 'Descripción', 'Estado'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {types.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{t.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{t.codigo}</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">{t.descripcion}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.estado === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.estado === 'active' ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
