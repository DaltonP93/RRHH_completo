'use client'
import { useState, useEffect } from 'react'
import { Shield, Loader2, Info } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface IpsRecord {
  id: number
  periodo: string
  empleado: string
  salario_imponible: number
  ap_obrero: number
  ap_patronal: number
  total: number
  estado: string
}

export default function IpsPage() {
  const [items, setItems] = useState<IpsRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/compliance/ips')
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <BackButton href="/cumplimiento" label="Cumplimiento Legal" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          <Shield className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IPS / REI</h1>
          <p className="text-sm text-slate-500">Aportes al Instituto de Previsión Social</p>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <span>Régimen General IPS: Aporte Obrero 9% + Patronal 16.5% = 25.5%</span>
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Período</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Empleado</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Salario Imponible</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Ap. Obrero (9%)</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Ap. Patronal (16.5%)</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Total</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{item.periodo}</td>
                  <td className="px-4 py-3 text-slate-800">{item.empleado}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.salario_imponible?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.ap_obrero?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.ap_patronal?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{item.total?.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-slate-600">{item.estado}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No hay registros IPS. Los aportes se calculan al aprobar una liquidación.
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
