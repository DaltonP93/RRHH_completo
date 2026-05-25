'use client'
import { useState, useEffect } from 'react'
import { ClipboardList, Loader2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface TipoNomina {
  id: number
  codigo: string
  nombre: string
  descripcion: string
  activo: boolean
}

export default function TiposNominaPage() {
  const [items, setItems] = useState<TipoNomina[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/settlement-types')
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <BackButton href="/nomina" label="Nómina" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
            <ClipboardList className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tipos de Nómina</h1>
            <p className="text-sm text-slate-500">Configuración de tipos de liquidación disponibles</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} />
          Nuevo tipo
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-slate-300" size={24} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Código</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Descripción</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-700">{item.codigo}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{item.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{item.descripcion}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                      item.activo
                        ? 'bg-green-50 text-green-700 border border-green-100'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.activo ? 'Sí' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                    No hay tipos de nómina configurados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
