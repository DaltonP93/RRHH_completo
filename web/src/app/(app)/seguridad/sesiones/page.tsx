'use client'

import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { api } from '@/lib/api'

interface Session {
  id: string
  usuario: string
  rol: string
  ip: string
  ultimo_acceso: string
}

export default function SesionesPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/active-sessions')
      .then(r => setSessions(r.data ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [])

  async function closeSession(id: string) {
    setClosing(id)
    try {
      await api.delete(`/api/active-sessions/${id}`)
      setSessions(prev => prev.filter(s => s.id !== id))
    } catch { /* silent */ }
    setClosing(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Activity className="w-5 h-5 text-slate-500" />
          Sesiones Activas
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Usuarios conectados actualmente al sistema</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conexiones activas</span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <Activity className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay sesiones activas registradas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Usuario', 'Rol', 'IP', 'Último acceso', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.usuario}</td>
                  <td className="px-4 py-2.5 text-slate-600">{s.rol}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.ip}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.ultimo_acceso}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => closeSession(s.id)}
                      disabled={closing === s.id}
                      className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                    >
                      {closing === s.id ? 'Cerrando...' : 'Cerrar sesión'}
                    </button>
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
