'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { landingFor } from '@/lib/useCurrentUser'

interface SiteSettings {
  system_name: string
  system_logo_url: string
  system_login_bg: string
  system_primary_color: string
  system_login_title: string
  system_login_subtitle: string
}

const DEFAULT: SiteSettings = {
  system_name: 'Sistema de Asistencia',
  system_logo_url: '',
  system_login_bg: 'from-slate-900 to-blue-900',
  system_primary_color: '#2563eb',
  system_login_title: 'Sistema de Asistencia',
  system_login_subtitle: 'Recursos Humanos',
}

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT)

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    fetch(`${apiUrl}/api/settings`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSettings(s => ({ ...s, ...data })) })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await authApi.login(form.username, form.password)
      localStorage.setItem('access_token', data.accessToken)
      localStorage.setItem('refresh_token', data.refreshToken)
      localStorage.setItem('user', JSON.stringify(data.user))
      router.push(landingFor(data.user.role))
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${settings.system_login_bg} flex items-center justify-center p-4`}>
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          {settings.system_logo_url ? (
            <img
              src={settings.system_logo_url}
              alt={settings.system_name}
              className="h-16 mx-auto mb-4 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: settings.system_primary_color }}
            >
              <span className="text-3xl">🕐</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{settings.system_login_title}</h1>
          <p className="text-slate-500 text-sm mt-1">{settings.system_login_subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="usuario o email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
            style={{ backgroundColor: settings.system_primary_color }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

      </div>
    </div>
  )
}
