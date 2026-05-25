'use client'
import { useState, useEffect } from 'react'
import { FolderOpen, Loader2, User } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Empleado {
  id: number
  nombre: string
  cargo: string
  departamento: string
  estado_legajo?: string
  estado?: string
}

export default function LegajosPage() {
  const [items, setItems] = useState<Empleado[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/employees')
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <BackButton href="/empleados" label="Personas" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          <FolderOpen className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Legajos</h1>
          <p className="text-sm text-slate-500">Expediente digital de cada empleado</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-slate-300" size={24} />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow px-6 py-14 text-center text-slate-400">
          No hay legajos configurados. Los legajos se crean automáticamente al registrar un empleado.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow p-5 flex items-start gap-4 hover:border-slate-200 transition-colors">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-slate-500" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold text-slate-800 truncate">{item.nombre}</p>
                <p className="text-sm text-slate-500 truncate">{item.cargo}</p>
                <p className="text-xs text-slate-400 truncate">{item.departamento}</p>
                <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                  (item.estado_legajo ?? item.estado) === 'activo'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {item.estado_legajo ?? item.estado ?? 'pendiente'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
