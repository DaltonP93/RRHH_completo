'use client'
import { useState, useEffect } from 'react'
import { Users, Loader2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Familiar {
  id: number
  empleado: string
  familiar: string
  parentesco: string
  fecha_nacimiento: string
  ci: string
  ips_beneficiario: boolean
}

export default function FamiliaresPage() {
  const [items, setItems] = useState<Familiar[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/employee-dependents')
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
            <Users className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Familiares y Cargas</h1>
            <p className="text-sm text-slate-500">Registro de cargas de familia y beneficiarios IPS</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} />
          Registrar familiar
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Familiar</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Parentesco</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha Nacimiento</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">CI</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">IPS Beneficiario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800 font-medium">{item.empleado}</td>
                  <td className="px-4 py-3 text-slate-800">{item.familiar}</td>
                  <td className="px-4 py-3 text-slate-600">{item.parentesco}</td>
                  <td className="px-4 py-3 text-slate-600">{item.fecha_nacimiento}</td>
                  <td className="px-4 py-3 text-slate-600">{item.ci}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                      item.ips_beneficiario
                        ? 'bg-green-50 text-green-700 border border-green-100'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.ips_beneficiario ? 'Sí' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No hay familiares registrados.
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
