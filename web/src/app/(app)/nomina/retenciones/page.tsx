'use client'
import { useState, useEffect } from 'react'
import { Shield, Loader2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Retencion {
  id: number
  empleado: string
  expediente: string
  juzgado: string
  monto_mensual: number
  fecha_inicio: string
  fecha_fin: string
  estado: string
}

export default function RetencionesPage() {
  const [items, setItems] = useState<Retencion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/payroll/judicial-retentions')
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
            <Shield className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Retenciones Judiciales</h1>
            <p className="text-sm text-slate-500">Descuentos ordenados por resolución judicial sobre salarios</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} />
          Registrar retención
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Empleado</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Expediente</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Juzgado</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Monto Mensual (Gs.)</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Inicio</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Fin</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{item.empleado}</td>
                  <td className="px-4 py-3 text-slate-600">{item.expediente}</td>
                  <td className="px-4 py-3 text-slate-600">{item.juzgado}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.monto_mensual?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_inicio}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_fin}</td>
                  <td className="px-4 py-3 text-slate-600">{item.estado}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No hay retenciones judiciales activas.
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
