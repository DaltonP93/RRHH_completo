'use client'
import { useState, useEffect } from 'react'
import { Banknote, Plus, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Lote {
  id: number
  batch_number?: string
  bank_name?: string
  period?: string
  employee_count?: number
  total_amount?: number
  status?: string
  generated_at?: string
}

export default function BancosLotesPage() {
  const [items, setItems] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/payment-batches')
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
            <Banknote className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lotes de Pago</h1>
            <p className="text-sm text-slate-500">Generación y seguimiento de lotes para acreditación bancaria</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-white text-sm hover:bg-slate-700">
          <Plus size={14} /> Generar lote
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
                {['Lote #', 'Banco', 'Período', 'Empleados', 'Monto Total (Gs.)', 'Estado', 'Fecha Generación'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-700">{item.batch_number || `L-${item.id}`}</td>
                  <td className="px-4 py-3 text-slate-700">{item.bank_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.period || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{item.employee_count ?? 0}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">Gs. {(item.total_amount || 0).toLocaleString('es-PY')}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      {item.status || 'draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {item.generated_at ? new Date(item.generated_at).toLocaleDateString('es-PY') : '—'}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No hay lotes de pago generados. Los lotes se crean a partir de liquidaciones aprobadas.
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
