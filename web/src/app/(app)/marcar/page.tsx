'use client'
import { useState } from 'react'
import { MapPin, QrCode, LogIn, LogOut, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

export default function MarcarPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [token, setToken] = useState('')

  async function getGeo(): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  async function mark(type: 'in' | 'out', mode: 'geo' | 'qr') {
    setLoading(true); setMsg(null)
    try {
      const body: any = { type }
      if (mode === 'geo') {
        const geo = await getGeo()
        if (!geo) { setMsg({ type: 'err', text: 'No se pudo obtener la ubicación. Habilita el GPS.' }); setLoading(false); return }
        body.lat = geo.lat; body.lng = geo.lng
      } else {
        if (!token.trim()) { setMsg({ type: 'err', text: 'Ingresa o escanea el código QR' }); setLoading(false); return }
        body.token = token.trim()
        const geo = await getGeo()
        if (geo) { body.lat = geo.lat; body.lng = geo.lng }
      }
      const res = await api.post('/api/self-checkin/mark', body)
      setMsg({ type: 'ok', text: `Marcación registrada (${res.data.source} · ${type === 'in' ? 'entrada' : 'salida'})` })
      setToken('')
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || 'Error al marcar' })
    } finally { setLoading(false) }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi marcación</h1>
        <p className="text-sm text-slate-500">Registra tu entrada o salida usando GPS o código QR de tu sede.</p>
      </div>

      {msg && (
        <div role="alert" className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2
          ${msg.type === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                              : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* Modo GPS */}
      <div className="bg-white rounded-2xl shadow border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="text-emerald-600" size={20} />
          <h2 className="font-semibold text-slate-900">Por ubicación (GPS)</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">Debes estar físicamente dentro del radio permitido de tu sede.</p>
        <div className="flex gap-2">
          <button onClick={() => mark('in', 'geo')} disabled={loading}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            <LogIn size={18} /> Entrada
          </button>
          <button onClick={() => mark('out', 'geo')} disabled={loading}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            <LogOut size={18} /> Salida
          </button>
        </div>
      </div>

      {/* Modo QR */}
      <div className="bg-white rounded-2xl shadow border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-3">
          <QrCode className="text-indigo-600" size={20} />
          <h2 className="font-semibold text-slate-900">Por código QR</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">Escanea el QR visible en tu sede (se renueva cada 5 min).</p>
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="Pega el token del QR aquí"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-3" />
        <div className="flex gap-2">
          <button onClick={() => mark('in', 'qr')} disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            <LogIn size={18} /> Entrada
          </button>
          <button onClick={() => mark('out', 'qr')} disabled={loading}
            className="flex-1 bg-slate-600 hover:bg-slate-700 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            <LogOut size={18} /> Salida
          </button>
        </div>
      </div>
    </div>
  )
}
