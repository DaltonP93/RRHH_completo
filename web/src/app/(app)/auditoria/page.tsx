'use client'
import { useEffect, useState } from 'react'
import {
  FileText, Filter, User as UserIcon, Globe, Clock, Search,
  CheckCircle, XCircle, AlertCircle, Settings as SettingsIcon, LogIn, Shield
} from 'lucide-react'
import { api } from '@/lib/api'

interface Event {
  id: number; user_id: number | null; username: string | null
  action: string; entity: string | null; entity_id: string | null
  ip: string | null; user_agent: string | null
  details: string | null; created_at: string
  actor_name: string | null; actor_role: string | null
}
interface ActionCount { action: string; total: number }

const ACTION_META: Record<string, { color: string; icon: any; label: string }> = {
  login_ok:          { color: 'bg-emerald-100 text-emerald-800', icon: LogIn,         label: 'Login OK' },
  login_fail:        { color: 'bg-red-100 text-red-800',         icon: XCircle,       label: 'Login falló' },
  settings_update:   { color: 'bg-blue-100 text-blue-800',       icon: SettingsIcon,  label: 'Config actualizada' },
  permission_create: { color: 'bg-purple-100 text-purple-800',   icon: FileText,      label: 'Permiso creado' },
  permission_approve:{ color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle,   label: 'Permiso aprobado' },
  permission_reject: { color: 'bg-red-100 text-red-800',         icon: XCircle,       label: 'Permiso rechazado' },
}

function todayISO()     { return new Date().toISOString().slice(0,10) }
function daysAgoISO(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10)
}

export default function AuditoriaPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [actions, setActions] = useState<ActionCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState({ action: '', from: daysAgoISO(7), to: todayISO() })

  async function load() {
    setLoading(true); setError('')
    try {
      const [{ data: ev }, { data: ac }] = await Promise.all([
        api.get('/api/audit', { params: filter }),
        api.get('/api/audit/actions'),
      ])
      setEvents(ev); setActions(ac)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filter.action, filter.from, filter.to])

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center">
          <FileText className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditoría</h1>
          <p className="text-slate-500 text-sm">
            Registro de eventos del sistema (logins, cambios sensibles, workflow).
          </p>
        </div>
      </div>

      {/* KPIs por acción */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {actions.slice(0, 6).map(a => {
          const meta = ACTION_META[a.action] || { color: 'bg-slate-100 text-slate-700', icon: Shield, label: a.action }
          return (
            <button
              key={a.action}
              onClick={() => setFilter(f => ({ ...f, action: f.action === a.action ? '' : a.action }))}
              className={`p-3 rounded-xl border text-left transition-all ${filter.action === a.action ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'} bg-white`}
            >
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
                <meta.icon size={12} /> {meta.label}
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{a.total}</p>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Filter size={16} /> Filtros
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Acción</label>
          <select value={filter.action} onChange={e => setFilter(f => ({ ...f, action: e.target.value }))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[180px]">
            <option value="">— Todas —</option>
            {actions.map(a => <option key={a.action} value={a.action}>{a.action} ({a.total})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Desde</label>
          <input type="date" value={filter.from} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Hasta</label>
          <input type="date" value={filter.to} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm">
          <Search size={14} /> Buscar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-red-900">{error}</div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando...</div>
        ) : events.length === 0 ? (
          <div className="p-10 text-center text-slate-400 space-y-2">
            <FileText className="mx-auto text-slate-300" size={40} />
            <p>Sin eventos en el rango.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Cuándo</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Entidad</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map(e => {
                const meta = ACTION_META[e.action] || { color: 'bg-slate-100 text-slate-700', icon: Shield, label: e.action }
                const Icon = meta.icon
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1"><Clock size={12} /> {new Date(e.created_at).toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <UserIcon size={14} className="text-slate-400" />
                        <div>
                          <p className="text-slate-900 font-medium text-xs">{e.actor_name || e.username || '—'}</p>
                          {e.actor_role && <p className="text-[10px] text-slate-400 capitalize">{e.actor_role.replace('_',' ')}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
                        <Icon size={12} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {e.entity ? <span>{e.entity}{e.entity_id ? ` #${e.entity_id}` : ''}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">
                      <div className="flex items-center gap-1">
                        <Globe size={12} /> {e.ip || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs">
                      {e.details ? <pre className="truncate text-[10px] font-mono">{e.details}</pre> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
