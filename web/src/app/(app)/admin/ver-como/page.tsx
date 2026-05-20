'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Eye, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { setViewAs } from '@/lib/viewAs'

interface UserEntry {
  id: number
  username: string
  role: string
  fullName?: string
  email?: string
}

export default function VerComoPage() {
  const user = useCurrentUser()
  const router = useRouter()
  const [users, setUsers] = useState<UserEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user === null) return // Still loading
    if (user?.role !== 'super_admin') {
      router.replace('/portal')
      return
    }

    async function fetchUsers() {
      try {
        const res = await api.get('/api/users')
        const data = res.data
        const list: UserEntry[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.users)
          ? data.users
          : []
        setUsers(list)
      } catch {
        setError('No se pudo cargar la lista de usuarios.')
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [user, router])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return (
      u.username.toLowerCase().includes(q) ||
      (u.fullName ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    )
  })

  function handleVerComo(u: UserEntry) {
    setViewAs({ userId: u.id, username: u.username, role: u.role })
    router.push('/portal')
  }

  if (user && user.role !== 'super_admin') return null

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Ver Como</h1>
        <p className="text-slate-500 mt-1">
          Simula la experiencia de otro usuario sin cambiar tus permisos reales.
        </p>
        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            La vista es solo visual — las APIs siguen respondiendo con tus permisos reales.
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          placeholder="Buscar por nombre, usuario o rol…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 text-sm py-8 justify-center">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No se encontraron usuarios.
            </div>
          ) : (
            filtered.map(u => (
              <div
                key={u.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {u.fullName || u.username}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    @{u.username}
                    {u.email ? ` · ${u.email}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {u.role}
                  </span>
                  <button
                    onClick={() => handleVerComo(u)}
                    className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <Eye size={14} />
                    Ver como
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
