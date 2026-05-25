'use client'
import { useEffect, useState } from 'react'
import { UserCheck, Plus, Pencil, Trash2, Shield, Check, X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

interface Role {
  id: number
  code: string
  name: string
  description: string
  is_system: boolean
  user_count: number
}

interface Permission {
  id: number
  code: string
  name: string
  module: string
  allowed: boolean
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Role | null>(null)
  const [perms, setPerms] = useState<Permission[]>([])
  const [permsLoading, setPermsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [showForm, setShowForm] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadRoles() {
    setLoading(true)
    try {
      const res = await api.get('/api/roles')
      const data = res.data
      setRoles(Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []))
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Error cargando roles')
    } finally { setLoading(false) }
  }

  async function loadPerms(role: Role) {
    setSelected(role)
    setPermsLoading(true)
    try {
      const res = await api.get(`/api/roles/${role.id}/permissions`)
      // API returns { role, permissions: [...] } — extract the array
      const data = res.data
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.permissions) ? data.permissions : [])
      setPerms(arr)
    } catch {
      setPerms([])
    } finally { setPermsLoading(false) }
  }

  async function saveRole() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await api.post('/api/roles', form)
      setForm({ name: '', description: '' })
      setShowForm(false)
      await loadRoles()
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Error guardando rol')
    } finally { setSaving(false) }
  }

  async function deleteRole(role: Role) {
    if (!confirm(`¿Eliminar rol "${role.name}"?`)) return
    try {
      await api.delete(`/api/roles/${role.id}`)
      if (selected?.id === role.id) { setSelected(null); setPerms([]) }
      await loadRoles()
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'No se puede eliminar')
    }
  }

  async function togglePerm(permId: number, allowed: boolean) {
    if (!selected) return
    const updated = perms.map(p => p.id === permId ? { ...p, allowed } : p)
    setPerms(updated)
    // API expects { permission_ids: [id1, id2, ...] } — IDs of allowed permissions
    const permissionIds = updated.filter(p => p.allowed).map(p => p.id)
    try {
      await api.put(`/api/roles/${selected.id}/permissions`, { permission_ids: permissionIds })
    } catch {
      setPerms(perms) // revert
    }
  }

  useEffect(() => { loadRoles() }, [])

  const grouped = perms.reduce<Record<string, Permission[]>>((acc, p) => {
    ;(acc[p.module] = acc[p.module] || []).push(p)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <BackButton href="/seguridad" label="Seguridad" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          <UserCheck className="text-white" size={18} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Roles</h1>
          <p className="text-sm text-slate-500">Gestiona los roles y sus permisos asignados</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-white text-sm hover:bg-slate-700"
        >
          <Plus size={14} /> Nuevo rol
        </button>
      </div>

      {err && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <X size={14} /> {err}
          <button className="ml-auto text-xs underline" onClick={() => setErr(null)}>Cerrar</button>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">Crear nuevo rol</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Nombre del rol"
              value={form.name}
              onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
            />
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Descripción"
              value={form.description}
              onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={saveRole} disabled={saving} className="px-4 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin inline" /> : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Role list */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-300" size={24} /></div>
          ) : (
            <ul>
              {roles.map(role => (
                <li key={role.id}>
                  <button
                    onClick={() => loadPerms(role)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 ${selected?.id === role.id ? 'bg-slate-50' : ''}`}
                  >
                    <Shield size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-slate-900 flex items-center gap-2">
                        {role.name}
                        {role.is_system && <span className="text-xs text-slate-400 font-normal">sistema</span>}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{role.description || role.code}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{role.user_count} usuario{role.user_count !== 1 ? 's' : ''}</div>
                    </div>
                    {!role.is_system && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteRole(role) }}
                        className="text-slate-300 hover:text-red-500 p-1 rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Permissions editor */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow p-8 text-center text-slate-400 text-sm">
              Selecciona un rol para ver y editar sus permisos
            </div>
          ) : permsLoading ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow p-8 flex justify-center">
              <Loader2 className="animate-spin text-slate-300" size={24} />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-700 text-sm">
                Permisos — {selected.name}
              </div>
              <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
                {Object.entries(grouped).map(([module, ps]) => (
                  <div key={module}>
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-2">{module}</div>
                    <div className="space-y-1">
                      {ps.map(p => (
                        <label key={p.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                          <button
                            onClick={() => togglePerm(p.id, !p.allowed)}
                            className={`w-8 h-4.5 rounded-full flex items-center justify-center transition-colors ${p.allowed ? 'bg-emerald-500' : 'bg-slate-200'}`}
                          >
                            {p.allowed ? <Check size={10} className="text-white" /> : <X size={10} className="text-slate-400" />}
                          </button>
                          <div>
                            <div className="text-sm text-slate-800">{p.name}</div>
                            <div className="text-xs text-slate-400 font-mono">{p.code}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
