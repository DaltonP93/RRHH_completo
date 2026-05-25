'use client'
import { useState, useEffect } from 'react'
import { CreditCard, Plus, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Cuenta {
  id: number
  employee_name?: string
  bank_name?: string
  account_type?: string
  account_number?: string
  currency?: string
  is_primary?: boolean
  status?: string
}

export default function CuentasEmpleadosPage() {
  const [items, setItems] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/employee-bank-accounts')
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <BackButton href="/bancos" label="Pagos y Bancos" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
            <CreditCard className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cuentas de Empleados</h1>
            <p className="text-sm text-slate-500">Cuentas bancarias registradas para acreditación de salarios</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-white text-sm hover:bg-slate-700">
          <Plus size={14} /> Registrar cuenta
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
                {['Empleado', 'Banco', 'Tipo Cuenta', 'Número de Cuenta', 'Moneda', 'Principal', 'Estado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-900 font-medium">{item.employee_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{item.bank_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.account_type || '—'}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{item.account_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.currency || 'PYG'}</td>
                  <td className="px-4 py-3">
                    {item.is_primary ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Principal</span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      {item.status || 'activa'}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No hay cuentas bancarias registradas para empleados.
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
