'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { api } from '@/lib/api'

interface Company {
  id: number
  razon_social: string
  ruc: string
  nombre_comercial: string
  numero_patronal: string
  estado: 'active' | 'inactive'
}

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/companies')
      .then(r => setCompanies(r.data ?? []))
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-slate-500" />
          Empresas y Sucursales
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Datos legales, RUC y número patronal MTESS de cada empresa
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Empresas registradas
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <Building2 className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay empresas registradas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Razón Social', 'RUC', 'Nombre Comercial', 'N° Patronal MTESS', 'Estado'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.razon_social}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.ruc}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.nombre_comercial}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.numero_patronal}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${c.estado === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.estado === 'active' ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
