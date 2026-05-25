'use client'
import { useState, useEffect } from 'react'
import { History, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Pago {
  id: number
  payment_date?: string
  employee_name?: string
  concept?: string
  amount?: number
  bank_name?: string
  batch_id?: number
  status?: string
}

export default function BancosHistorialPage() {
  const [items, setItems] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/payment-history')
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

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          <History className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historial de Pagos</h1>
          <p className="text-sm text-slate-500">Registro de todos los pagos realizados a empleados</p>
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
                {['Fecha', 'Empleado', 'Concepto', 'Monto (Gs.)', 'Banco', 'Lote', 'Estado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">
                    {item.payment_date ? new Date(item.payment_date).toLocaleDateString('es-PY') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-medium">{item.employee_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{item.concept || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">Gs. {(item.amount || 0).toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3 text-slate-500">{item.bank_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-slate-400 text-xs">{item.batch_id ? `L-${item.batch_id}` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      {item.status || '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No hay pagos registrados en el historial.
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
