'use client'
import { useEffect, useState } from 'react'
import { CheckSquare, Search, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Permission {
  id: number
  code: string
  name: string
  description: string
  module: string
}

export default function PermisosPage() {
  const [perms, setPerms] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')

  useEffect(() => {
    api.get('/api/permissions')
      .then(r => setPerms(r.data || []))
      .finally(() => setLoading(false))
  }, [])

  const modules = ['all', ...Array.from(new Set(perms.map(p => p.module))).sort()]
  const filtered = perms.filter(p =>
    (moduleFilter === 'all' || p.module === moduleFilter) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search.toLowerCase()))
  )
  const grouped = filtered.reduce<Record<string, Permission[]>>((acc, p) => {
    ;(acc[p.module] = acc[p.module] || []).push(p)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <BackButton href="/seguridad" label="Seguridad" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          <CheckSquare className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo de permisos</h1>
          <p className="text-sm text-slate-500">Todos los permisos definidos en el sistema</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="Buscar permiso..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
        >
          {modules.map(m => (
            <option key={m} value={m}>{m === 'all' ? 'Todos los módulos' : m}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-300" size={28} /></div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([module, ps]) => (
            <section key={module}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase mb-3">{module}</h2>
              <div className="bg-white rounded-2xl border border-slate-100 shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="text-left px-4 py-2 font-medium">Nombre</th>
                      <th className="text-left px-4 py-2 font-medium font-mono">Código</th>
                      <th className="text-left px-4 py-2 font-medium">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ps.map((p, i) => (
                      <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.code}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!Object.keys(grouped).length && (
            <div className="text-center text-slate-400 py-8 text-sm">No se encontraron permisos</div>
          )}
        </div>
      )}

      <div className="text-xs text-slate-400 text-right">{filtered.length} permisos</div>
    </div>
  )
}
