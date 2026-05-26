'use client'
import { useState, useEffect } from 'react'
import { TrendingUp, Search, ChevronUp, ChevronDown, Minus } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'

interface SalaryHistory {
  id: number
  empleado: string
  fecha_vigencia: string
  salario_anterior: number
  salario_nuevo: number
  variacion_porcentaje: number
  motivo: string
  registrado_por: string
  // legacy field alias
  fecha_efectiva?: string
}

function fmtGs(n: number | null | undefined): string {
  if (n == null) return '—'
  return 'Gs. ' + n.toLocaleString('es-PY')
}

function VariacionCell({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-slate-400 text-xs">—</span>
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs font-semibold">
        <ChevronUp size={13} />
        {pct.toFixed(2)}%
      </span>
    )
  }
  if (pct < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-600 text-xs font-semibold">
        <ChevronDown size={13} />
        {Math.abs(pct).toFixed(2)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-slate-400 text-xs">
      <Minus size={12} />
      0.00%
    </span>
  )
}

export default function HistoricoSalarialPage() {
  const [items, setItems] = useState<SalaryHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/api/employee-salary-history')
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
        icon={TrendingUp}
        iconColor="bg-emerald-700"
        title="Histórico Salarial"
        subtitle="Evolución salarial del personal (en PYG)"
        breadcrumbs={[
          { label: 'Personas', href: '/empleados' },
          { label: 'Histórico Salarial' },
        ]}
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
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
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
              icon={TrendingUp}
              title="Sin historial salarial"
              description="El historial se genera automáticamente al actualizar salarios"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha Vigencia</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Salario Anterior</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Salario Nuevo</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Variación %</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Motivo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Registrado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {item.fecha_vigencia ?? item.fecha_efectiva ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 text-right font-mono">
                        {fmtGs(item.salario_anterior)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800 text-right font-mono">
                        {fmtGs(item.salario_nuevo)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <VariacionCell pct={item.variacion_porcentaje} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.motivo ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{item.registrado_por ?? '—'}</td>
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
