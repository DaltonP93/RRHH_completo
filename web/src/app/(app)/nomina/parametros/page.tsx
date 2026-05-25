'use client'
import { useState, useEffect } from 'react'
import { Settings, Loader2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Parametro {
  id: number
  period: string
  minimum_wage: number
  ips_employee_rate: number
  ips_employer_rate: number
  aguinaldo_rate: number
  status: string
}

export default function ParametrosPage() {
  const [items, setItems] = useState<Parametro[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/payroll-monthly-parameters')
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
            <Settings className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Parámetros Mensuales</h1>
            <p className="text-sm text-slate-500">Valores y tasas configurables por período de nómina</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} />
          Nuevo período
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-slate-300" size={24} />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow px-6 py-14 text-center text-slate-400">
          No hay parámetros configurados. Configure los valores del período actual.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-slate-800">{item.period}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  item.status === 'active'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {item.status}
                </span>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Salario mínimo</dt>
                  <dd className="font-medium text-slate-800">Gs. {item.minimum_wage?.toLocaleString('es-PY')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">IPS Obrero</dt>
                  <dd className="font-medium text-slate-800">{item.ips_employee_rate}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">IPS Patronal</dt>
                  <dd className="font-medium text-slate-800">{item.ips_employer_rate}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tasa Aguinaldo</dt>
                  <dd className="font-medium text-slate-800">{item.aguinaldo_rate}%</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
