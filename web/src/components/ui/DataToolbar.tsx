'use client'
import { Search, Filter, Download, RefreshCw } from 'lucide-react'
import { useState } from 'react'

interface Props {
  onSearch?: (q: string) => void
  searchPlaceholder?: string
  filters?: React.ReactNode
  actions?: React.ReactNode
  onRefresh?: () => void
  onExport?: () => void
  count?: number
  countLabel?: string
}

export default function DataToolbar({
  onSearch,
  searchPlaceholder = 'Buscar...',
  filters,
  actions,
  onRefresh,
  onExport,
  count,
  countLabel = 'registros',
}: Props) {
  const [q, setQ] = useState('')

  function handleSearch(val: string) {
    setQ(val)
    onSearch?.(val)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap py-2.5 px-3 bg-slate-50 border-b border-slate-100">
      {/* Search */}
      {onSearch && (
        <div className="relative flex-shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-slate-300 w-48 placeholder:text-slate-400"
            placeholder={searchPlaceholder}
            value={q}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      )}

      {/* Filters slot */}
      {filters && (
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-slate-400" />
          {filters}
        </div>
      )}

      {/* Count */}
      {count != null && (
        <span className="text-xs text-slate-400 font-medium">
          {count} {countLabel}
        </span>
      )}

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        {actions}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={13} />
          </button>
        )}
        {onExport && (
          <button
            onClick={onExport}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Exportar"
          >
            <Download size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
