'use client'
import { useState, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface MtessRecord {
  id: number
  tipo: string
  periodo: string
  estado: string
  fecha_generacion: string
  fecha_envio: string
  acuse: string
}

export default function MtessPage() {
  const [items, setItems] = useState<MtessRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/compliance/mtess')
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
            <Send className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">MTESS / REOP</h1>
            <p className="text-sm text-slate-500">Presentaciones electrónicas al Ministerio de Trabajo</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Send size={15} />
          Generar presentación
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Período</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Generación</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Envío</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Acuse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{item.tipo}</td>
                  <td className="px-4 py-3 text-slate-600">{item.periodo}</td>
                  <td className="px-4 py-3 text-slate-600">{item.estado}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_generacion}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_envio}</td>
                  <td className="px-4 py-3 text-slate-600">{item.acuse}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No hay presentaciones MTESS registradas para el período seleccionado.
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
