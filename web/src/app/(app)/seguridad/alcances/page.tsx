'use client'
import { useEffect, useState } from 'react'
import { Building2, Search, UserCheck, Loader2, Plus, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface UserScope {
  id: number
  username: string
  display_name: string
  email: string
  roles: { role_code: string; role_name: string; scope_type: string }[]
  scopes: { scope_type: string; company_id: number | null; branch_id: number | null }[]
}

interface RoleOption { code: string; name: string }

export default function AlcancesPage() {
  const [users, setUsers] = useState<{ id: number; username: string; display_name: string; email: string }[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [scopeData, setScopeData] = useState<UserScope | null>(null)
  const [loading, setLoading] = useState(true)
  const [scopeLoading, setScopeLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [assignForm, setAssignForm] = useState({ role_code: '', scope_type: 'global' })
  const [assigning, setAssigning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/api/users').then(r => setUsers(r.data?.users || r.data || [])),
      api.get('/api/roles').then(r => setRoles(r.data?.map((ro: any) => ({ code: ro.code, name: ro.name })) || [])),
    ]).finally(() => setLoading(false))
  }, [])

  async function loadScope(userId: number) {
    setSelectedUserId(userId)
    setScopeLoading(true)
    try {
      const res = await api.get(`/api/user-scopes?user_id=${userId}`)
      setScopeData(res.data)
    } catch { setScopeData(null) }
    finally { setScopeLoading(false) }
  }

  async function assignRole() {
    if (!selectedUserId || !assignForm.role_code) return
    setAssigning(true)
    setErr(null)
    try {
      await api.post('/api/user-scopes/assign-role', {
        user_id: selectedUserId,
        role_code: assignForm.role_code,
        scope_type: assignForm.scope_type,
      })
      await loadScope(selectedUserId)
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Error asignando rol')
    } finally { setAssigning(false) }
  }

  async function removeRole(roleCode: string) {
    if (!selectedUserId) return
    try {
      await api.delete('/api/user-scopes/remove-role', {
        data: { user_id: selectedUserId, role_code: roleCode },
      })
      await loadScope(selectedUserId)
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Error eliminando rol')
    }
  }

  const filteredUsers = users.filter(u =>
    !search ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <BackButton href="/seguridad" label="Seguridad" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          <Building2 className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alcances y roles por usuario</h1>
          <p className="text-sm text-slate-500">Asigna roles con alcance global, empresa, sucursal o departamento</p>
        </div>
      </div>

      {err && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <X size={14} /> {err}
          <button className="ml-auto text-xs underline" onClick={() => setErr(null)}>Cerrar</button>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        {/* User list */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="Buscar usuario..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-300" size={22} /></div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {filteredUsers.map(u => (
                <li key={u.id}>
                  <button
                    onClick={() => loadScope(u.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 border-b border-slate-50 ${selectedUserId === u.id ? 'bg-slate-50' : ''}`}
                  >
                    <UserCheck size={14} className="text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{u.display_name || u.username}</div>
                      <div className="text-xs text-slate-400 truncate">{u.email || u.username}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Scope detail */}
        <div className="lg:col-span-3">
          {!selectedUserId ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow p-8 text-center text-slate-400 text-sm">
              Selecciona un usuario para gestionar sus roles y alcances
            </div>
          ) : scopeLoading ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow p-8 flex justify-center">
              <Loader2 className="animate-spin text-slate-300" size={24} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current roles */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
                  Roles asignados
                </div>
                {!scopeData?.roles?.length ? (
                  <div className="px-4 py-4 text-sm text-slate-400">Sin roles asignados</div>
                ) : (
                  <ul>
                    {scopeData.roles.map((r, i) => (
                      <li key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-b-0">
                        <div>
                          <span className="text-sm font-medium text-slate-800">{r.role_name}</span>
                          <span className="ml-2 text-xs text-slate-400 font-mono">{r.role_code}</span>
                          {r.scope_type && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">{r.scope_type}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeRole(r.role_code)}
                          className="text-slate-300 hover:text-red-500 p-1 rounded transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Assign role form */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3">Asignar nuevo rol</div>
                <div className="flex gap-2">
                  <select
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    value={assignForm.role_code}
                    onChange={e => setAssignForm(v => ({ ...v, role_code: e.target.value }))}
                  >
                    <option value="">Seleccionar rol...</option>
                    {roles.map(r => (
                      <option key={r.code} value={r.code}>{r.name}</option>
                    ))}
                  </select>
                  <select
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    value={assignForm.scope_type}
                    onChange={e => setAssignForm(v => ({ ...v, scope_type: e.target.value }))}
                  >
                    <option value="global">Global</option>
                    <option value="company">Empresa</option>
                    <option value="branch">Sucursal</option>
                    <option value="department">Departamento</option>
                    <option value="own">Propio</option>
                  </select>
                  <button
                    onClick={assignRole}
                    disabled={assigning || !assignForm.role_code}
                    className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {assigning ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    Asignar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
