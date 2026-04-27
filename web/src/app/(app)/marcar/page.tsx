'use client'
import { useState, useEffect } from 'react'
import { MapPin, QrCode, LogIn, LogOut, CheckCircle2, AlertCircle, Camera, Scan, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import SelfieCapture from '@/components/SelfieCapture'
import QrScanner from '@/components/QrScanner'
import { enqueue, listPending, flush, setupAutoRetry, type PendingPunch } from '@/lib/offlineQueue'

export default function MarcarPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [token, setToken] = useState('')
  const [selfie, setSelfie] = useState<string | null>(null)
  const [useSelfie, setUseSelfie] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState<PendingPunch[]>([])

  useEffect(() => {
    setOnline(navigator.onLine)
    setPending(listPending())
    setupAutoRetry()
    const onOn  = () => setOnline(true)
    const onOff = () => setOnline(false)
    const onFlushed = () => setPending(listPending())
    window.addEventListener('online',  onOn)
    window.addEventListener('offline', onOff)
    window.addEventListener('sishoras:queue-flushed', onFlushed as any)
    return () => {
      window.removeEventListener('online',  onOn)
      window.removeEventListener('offline', onOff)
      window.removeEventListener('sishoras:queue-flushed', onFlushed as any)
    }
  }, [])

  async function flushQueue() {
    const r = await flush()
    setPending(listPending())
    setMsg({
      type: r.failed === 0 ? 'ok' : 'err',
      text: `Cola sincronizada: ${r.sent} enviado(s), ${r.failed} fallido(s)`,
    })
  }

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
      if (selfie) body.selfie = selfie
      try {
        const res = await api.post('/api/self-checkin/mark', body)
        setMsg({ type: 'ok', text: `Marcación registrada (${res.data.source} · ${type === 'in' ? 'entrada' : 'salida'})${selfie ? ' con selfie' : ''}` })
      } catch (netErr: any) {
        // Si parece error de red (sin response), guardar en cola offline
        if (!netErr?.response) {
          enqueue({ type, token: body.token, lat: body.lat, lng: body.lng, selfie })
          setPending(listPending())
          setMsg({ type: 'ok', text: 'Sin conexión — marcaje guardado y se enviará automáticamente al volver online' })
        } else {
          throw netErr
        }
      }
      setToken('')
      setSelfie(null)
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || 'Error al marcar' })
    } finally { setLoading(false) }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi marcación</h1>
          <p className="text-sm text-slate-500">Registra tu entrada o salida usando GPS o código QR de tu sede.</p>
        </div>
        <div className="flex items-center gap-2">
          {online ? (
            <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <Wifi size={12} /> Conectado
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
              <WifiOff size={12} /> Sin conexión
            </span>
          )}
          {pending.length > 0 && (
            <button onClick={flushQueue}
              className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">
              <RefreshCw size={12} /> {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
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

      {/* Selfie de verificación (opcional) */}
      <div className="bg-white rounded-2xl shadow border border-slate-100 p-6">
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input type="checkbox" checked={useSelfie} onChange={e => { setUseSelfie(e.target.checked); if (!e.target.checked) setSelfie(null) }}
            className="accent-blue-600 w-4 h-4" />
          <Camera size={18} className="text-blue-600" />
          <span className="font-semibold text-slate-900">Adjuntar selfie de verificación</span>
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Opcional. La foto queda asociada al marcaje para validación visual posterior.
        </p>
        {useSelfie && <SelfieCapture onCapture={setSelfie} />}
      </div>

      {/* Modo QR */}
      <div className="bg-white rounded-2xl shadow border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-3">
          <QrCode className="text-indigo-600" size={20} />
          <h2 className="font-semibold text-slate-900">Por código QR</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">Escanea el QR visible en tu sede (se renueva cada 5 min).</p>

        {showScanner ? (
          <div className="mb-3">
            <QrScanner
              onScan={(text) => { setToken(text); setShowScanner(false); setMsg({ type: 'ok', text: 'QR detectado, presioná Entrada o Salida' }) }}
              onClose={() => setShowScanner(false)}
            />
          </div>
        ) : (
          <button onClick={() => setShowScanner(true)}
            className="w-full mb-3 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors">
            <Scan size={16} /> Escanear con la cámara
          </button>
        )}

        <input value={token} onChange={e => setToken(e.target.value)} placeholder="O pegá el token del QR aquí"
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
