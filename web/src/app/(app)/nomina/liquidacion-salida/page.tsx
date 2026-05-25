'use client'
import { useState, useEffect } from 'react'
import { FileClock, Loader2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface LiquidacionSalida {
  id: number
  empleado: string
  fecha_desvinculacion: string
  motivo: string
  dias_trabajados: number
  total: number
  estado: string
  type?: string
}

export default function LiquidacionSalidaPage() {
  const [items, setItems] = useState<LiquidacionSalida[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/payroll-runs')
      .catch(() => ({ data: [] }))
      .then(r => {
        const d = r.data
        const all = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
        setItems(all.filter((x: LiquidacionSalida) => x.type === 'LIQUIDACION_SALIDA'))
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
            <FileClock className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Liquidación de Salida</h1>
            <p className="text-sm text-slate-500">Liquidaciones finales por desvinculación de personal</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} />
          Nueva liquidación de salida
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Desvinculación</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Motivo</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Días Trabajados</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Total (Gs.)</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800 font-medium">{item.empleado}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_desvinculacion}</td>
                  <td className="px-4 py-3 text-slate-600">{item.motivo}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.dias_trabajados}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{item.total?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-slate-600">{item.estado}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No hay liquidaciones de salida registradas.
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
