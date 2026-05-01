'use client'
import { useState, useEffect, useRef } from 'react'
import { MapPin, QrCode, LogIn, LogOut, CheckCircle2, AlertCircle, Camera, Scan, Wifi, WifiOff, RefreshCw, ScanFace, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import SelfieCapture from '@/components/SelfieCapture'
import QrScanner from '@/components/QrScanner'
import { enqueue, listPending, flush, setupAutoRetry, type PendingPunch } from '@/lib/offlineQueue'
import { useCurrentUser } from '@/lib/useCurrentUser'

// face-api.js UMD loaded lazily via script tag; avoids bundler issues with CDN ESM
const FACE_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js'
const FACE_MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
let faceApiLoading: Promise<any> | null = null

async function loadFaceApi(): Promise<any> {
  if ((window as any).faceapi?.nets) return (window as any).faceapi
  if (faceApiLoading) return faceApiLoading
  faceApiLoading = (async () => {
    if (!(window as any).faceapi) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = FACE_CDN
        s.crossOrigin = 'anonymous'
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('No se pudo cargar face-api.js'))
        document.head.appendChild(s)
      })
    }
    const fa = (window as any).faceapi
    await Promise.all([
      fa.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL),
      fa.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
      fa.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODELS_URL),
    ])
    return fa
  })()
  return faceApiLoading
}

export default function MarcarPage() {
  const user = useCurrentUser()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [token, setToken] = useState('')
  const [selfie, setSelfie] = useState<string | null>(null)
  const [useSelfie, setUseSelfie] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState<PendingPunch[]>([])

  // Face verification state
  const [useFace, setUseFace] = useState(false)
  const [faceLoading, setFaceLoading] = useState(false)
  const [faceResult, setFaceResult] = useState<{ matched: boolean; distance: number } | null>(null)
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

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
      stopCamera()
    }
  }, [])

  // Stop webcam stream
  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // Toggle face verification section
  async function toggleFace(enabled: boolean) {
    setUseFace(enabled)
    setFaceResult(null)
    setFaceDescriptor(null)
    if (!enabled) { stopCamera(); return }

    setFaceLoading(true)
    try {
      await loadFaceApi()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'No se pudo activar la cámara para Face ID.' })
      setUseFace(false)
      faceApiLoading = null
    } finally {
      setFaceLoading(false)
    }
  }

  // Compute descriptor from current video frame
  async function scanFace() {
    if (!videoRef.current) return
    setFaceLoading(true)
    setFaceResult(null)
    try {
      const fa = await loadFaceApi()
      const detection = await fa
        .detectSingleFace(videoRef.current, new fa.TinyFaceDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor()
      if (!detection) {
        setMsg({ type: 'err', text: 'No se detectó ningún rostro. Asegurate de estar frente a la cámara.' })
        return
      }
      const desc = Array.from(detection.descriptor) as number[]
      setFaceDescriptor(desc)

      if (!user?.employee_id) {
        setMsg({ type: 'err', text: 'Tu usuario no está vinculado a un empleado. No se puede verificar.' })
        return
      }
      const res = await api.post('/api/face/verify', { employee_id: user.employee_id, descriptor: desc })
      setFaceResult({ matched: res.data.matched, distance: res.data.distance })
      if (res.data.matched) {
        setMsg({ type: 'ok', text: `✅ Face ID verificado (distancia: ${res.data.distance})` })
      } else {
        setMsg({ type: 'err', text: `❌ Rostro no coincide (distancia: ${res.data.distance}). Intenta de nuevo o contacta RRHH.` })
      }
    } catch (e: any) {
      const code = e?.response?.data?.code
      if (code === 'NO_FACE') {
        setMsg({ type: 'err', text: 'No tenés descriptor facial registrado. Contacta a RRHH para enrolarte.' })
      } else {
        setMsg({ type: 'err', text: e?.response?.data?.error || 'Error al verificar rostro.' })
      }
    } finally {
      setFaceLoading(false)
    }
  }

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

      {/* Face ID (opcional) */}
      <div className="bg-white rounded-2xl shadow border border-slate-100 p-6">
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input type="checkbox" checked={useFace} onChange={e => toggleFace(e.target.checked)}
            className="accent-violet-600 w-4 h-4" />
          <ScanFace size={18} className="text-violet-600" />
          <span className="font-semibold text-slate-900">Verificación facial (Face ID)</span>
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Opcional. Compara tu rostro con el descriptor registrado en RRHH. El marcaje procede igual independientemente del resultado.
        </p>
        {useFace && (
          <div className="space-y-3">
            <video ref={videoRef} muted playsInline
              className="w-full rounded-xl bg-slate-900 aspect-video object-cover"
              style={{ display: faceLoading && !streamRef.current ? 'none' : 'block' }}
            />
            {faceLoading && !streamRef.current && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-4">
                <Loader2 size={16} className="animate-spin" /> Cargando modelos de IA…
              </div>
            )}
            {faceResult && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2
                ${faceResult.matched
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {faceResult.matched ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {faceResult.matched ? 'Rostro verificado' : 'Rostro no coincide'}
                <span className="ml-auto text-xs opacity-60">dist: {faceResult.distance}</span>
              </div>
            )}
            <button onClick={scanFace} disabled={faceLoading || !streamRef.current}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors">
              {faceLoading ? <Loader2 size={16} className="animate-spin" /> : <ScanFace size={16} />}
              Escanear mi rostro
            </button>
          </div>
        )}
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
