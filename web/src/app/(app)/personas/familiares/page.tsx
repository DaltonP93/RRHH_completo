'use client'
import { useState, useEffect } from 'react'
import { Users, Plus, Search } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'

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
  const [search, setSearch] = useState('')

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

  const filtered = items.filter(i =>
    i.empleado?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <EnterprisePageHeader
        icon={Users}
        iconColor="bg-blue-700"
        title="Familiares y Dependientes"
        subtitle="Registro de cargas familiares e IPS"
        breadcrumbs={[
          { label: 'Personas', href: '/empleados' },
          { label: 'Familiares' },
        ]}
        actions={
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus size={13} />
            Registrar familiar
          </button>
        }
      />

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empleado..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        {!loading && (
          <span className="text-xs text-slate-400">
            {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg skeleton-shimmer" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin familiares registrados"
              description="Los familiares son requeridos para trámites de IPS"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Familiar</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Parentesco</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha Nac.</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">CI</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">IPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{item.familiar}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.parentesco}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.fecha_nacimiento}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">{item.ci}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={item.ips_beneficiario ? 'active' : 'inactive'}
                          label={item.ips_beneficiario ? 'Sí' : 'No'}
                          showDot
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
