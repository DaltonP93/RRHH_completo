'use client'
import { useState, useEffect } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Preaviso {
  id: number
  empleado: string
  tipo: string
  fecha_inicio: string
  dias_preaviso: number
  fecha_vencimiento: string
  estado: string
}

export default function PreavísosPage() {
  const [items, setItems] = useState<Preaviso[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/payroll/preavisos')
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

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          <AlertCircle className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Preavisos</h1>
          <p className="text-sm text-slate-500">Gestión de períodos de preaviso en procesos de desvinculación</p>
        </div>
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Empleado</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Inicio</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Días Preaviso</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Vencimiento</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{item.empleado}</td>
                  <td className="px-4 py-3 text-slate-600">{item.tipo}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_inicio}</td>
                  <td className="px-4 py-3 text-slate-600">{item.dias_preaviso}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_vencimiento}</td>
                  <td className="px-4 py-3 text-slate-600">{item.estado}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No hay preavisos registrados. Se registran al iniciar un proceso de desvinculación.
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
