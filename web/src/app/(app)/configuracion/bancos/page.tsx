'use client'

import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { api } from '@/lib/api'

interface Bank {
  id: number
  nombre: string
  codigo: string
  tipo: 'banco' | 'coop' | 'financiera'
  estado: 'active' | 'inactive'
}

const TIPO_LABEL: Record<string, string> = { banco: 'Banco', coop: 'Cooperativa', financiera: 'Financiera' }
const TIPO_CLASS: Record<string, string> = {
  banco: 'bg-blue-50 text-blue-700',
  coop: 'bg-violet-50 text-violet-700',
  financiera: 'bg-amber-50 text-amber-700',
}

export default function BancosPage() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/banks')
      .then(r => setBanks(r.data ?? []))
      .catch(() => setBanks([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Landmark className="w-5 h-5 text-slate-500" />
          Bancos y Entidades Financieras
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Catálogo de bancos y entidades para acreditación de salarios
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Entidades registradas</span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : banks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <Landmark className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay bancos configurados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Nombre', 'Código', 'Tipo', 'Estado'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {banks.map(b => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{b.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{b.codigo}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${TIPO_CLASS[b.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                      {TIPO_LABEL[b.tipo] ?? b.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${b.estado === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {b.estado === 'active' ? 'Activo' : 'Inactivo'}
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
