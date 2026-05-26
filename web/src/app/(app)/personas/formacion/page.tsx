'use client'
import { useState, useEffect } from 'react'
import { GraduationCap, BookOpen, Plus, Search } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'

interface Educacion {
  id: number
  empleado: string
  titulo: string
  institucion: string
  anio: number
  tipo: string
  estado: string
  // legacy fields kept for fallback
  nivel_educativo?: string
  carrera?: string
  anio_egreso?: number
  validado?: boolean
}

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  grado:    { label: 'Grado',     cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  posgrado: { label: 'Posgrado',  cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  tecnico:  { label: 'Técnico',   cls: 'bg-teal-50 text-teal-700 ring-teal-200' },
  otros:    { label: 'Otros',     cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

function TipoBadge({ tipo }: { tipo: string }) {
  const cfg = TIPO_BADGE[tipo?.toLowerCase()] ?? TIPO_BADGE.otros
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

export default function FormacionPage() {
  const [items, setItems] = useState<Educacion[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/api/employee-education')
      .catch(() => ({ data: [] }))
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter(i => {
    const term = search.toLowerCase()
    return (
      i.empleado?.toLowerCase().includes(term) ||
      (i.titulo ?? i.carrera ?? '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <EnterprisePageHeader
        icon={GraduationCap}
        iconColor="bg-violet-700"
        title="Formación y Títulos"
        subtitle="Títulos académicos y certificaciones del personal"
        breadcrumbs={[
          { label: 'Personas', href: '/empleados' },
          { label: 'Formación' },
        ]}
        actions={
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus size={13} />
            Registrar título
          </button>
        }
      />

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empleado o título..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
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
              icon={GraduationCap}
              title="Sin títulos registrados"
              description="Registre los títulos académicos validados por RRHH"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <span className="flex items-center gap-1"><BookOpen size={11} /> Título</span>
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Institución</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Año</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(item => {
                    const tituloDisplay = item.titulo ?? item.carrera ?? item.nivel_educativo ?? '—'
                    const anioDisplay = item.anio ?? item.anio_egreso ?? '—'
                    const estadoKey = item.estado
                      ? item.estado.toLowerCase()
                      : (item.validado ? 'accepted' : 'pending')
                    const estadoLabel = item.estado
                      ? (item.estado === 'verificado' ? 'Verificado' : item.estado === 'pendiente' ? 'Pendiente' : item.estado)
                      : (item.validado ? 'Verificado' : 'Pendiente')
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.empleado}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{tituloDisplay}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.institucion}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{anioDisplay}</td>
                        <td className="px-4 py-3">
                          <TipoBadge tipo={item.tipo ?? 'otros'} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={estadoKey === 'verificado' ? 'accepted' : 'pending'}
                            label={estadoLabel}
                            showDot
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
