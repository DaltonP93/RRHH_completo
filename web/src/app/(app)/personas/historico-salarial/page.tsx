'use client'
import { useState, useEffect } from 'react'
import { History, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface SalaryHistory {
  id: number
  empleado: string
  salario_anterior: number
  salario_nuevo: number
  variacion_porcentaje: number
  motivo: string
  fecha_efectiva: string
}

export default function HistoricoSalarialPage() {
  const [items, setItems] = useState<SalaryHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/salary-history')
      .catch(() => ({ data: [] }))
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
          <History className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Histórico Salarial</h1>
          <p className="text-sm text-slate-500">Registro de variaciones salariales del personal</p>
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
                <th className="px-4 py-3 text-right font-medium text-slate-600">Salario Anterior (Gs.)</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Salario Nuevo (Gs.)</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">% Variación</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Motivo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Efectiva</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800 font-medium">{item.empleado}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.salario_anterior?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{item.salario_nuevo?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-medium ${
                      item.variacion_porcentaje > 0 ? 'text-green-600' : item.variacion_porcentaje < 0 ? 'text-red-600' : 'text-slate-500'
                    }`}>
                      {item.variacion_porcentaje > 0 ? '+' : ''}{item.variacion_porcentaje?.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.motivo}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_efectiva}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No hay registros de cambios salariales.
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
