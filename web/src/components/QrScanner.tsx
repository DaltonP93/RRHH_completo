'use client'
import { useEffect, useRef, useState } from 'react'
import { QrCode, AlertCircle, Camera, X } from 'lucide-react'

interface Props {
  onScan: (text: string) => void
  onClose?: () => void
}

/**
 * Escáner QR con la API nativa BarcodeDetector (Chrome, Edge, iOS Safari 17+).
 * No requiere librerías externas. Si el navegador no la soporta, muestra
 * un fallback con instrucciones para pegar el token manualmente.
 */
export default function QrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [supported, setSupported] = useState<boolean | null>(null)
  const detectingRef = useRef(false)

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])

  useEffect(() => {
    if (supported === null) return
    if (!supported) { setError('Tu navegador no soporta escaneo nativo de QR. Pegá el token manualmente.'); return }

    let cancel = false
    let s: MediaStream | null = null
    ;(async () => {
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancel) { s.getTracks().forEach(t => t.stop()); return }
        setStream(s)
        if (videoRef.current) {
          videoRef.current.srcObject = s
          await videoRef.current.play()
        }
        startDetect()
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado'
          : 'No se pudo acceder a la cámara')
      }
    })()

    return () => {
      cancel = true
      detectingRef.current = false
      s?.getTracks().forEach(t => t.stop())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  async function startDetect() {
    detectingRef.current = true
    // @ts-ignore — BarcodeDetector es API web nativa, no tiene tipos en TS
    const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
    const tick = async () => {
      if (!detectingRef.current) return
      const v = videoRef.current
      if (v && v.readyState === 4) {
        try {
          const codes = await detector.detect(v)
          if (codes && codes.length > 0) {
            detectingRef.current = false
            stop()
            onScan(codes[0].rawValue)
            return
          }
        } catch { /* try next frame */ }
      }
      requestAnimationFrame(tick)
    }
    tick()
  }

  function stop() {
    detectingRef.current = false
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
  }

  function close() {
    stop()
    onClose?.()
  }

  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-3 relative">
      <div className="flex items-center justify-between text-white">
        <h3 className="font-semibold flex items-center gap-2"><QrCode size={16} /> Escaneando QR</h3>
        {onClose && (
          <button onClick={close} className="p-1.5 hover:bg-white/10 rounded-lg" aria-label="Cerrar">
            <X size={16} />
          </button>
        )}
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-400/30 text-rose-200 rounded-xl p-4 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      ) : (
        <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          {/* Overlay marco */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3/5 aspect-square border-4 border-white/80 rounded-2xl shadow-2xl" />
          </div>
          <div className="absolute bottom-3 left-3 right-3 text-center text-white text-xs bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg">
            <Camera size={12} className="inline mr-1" /> Apuntá la cámara al código QR
          </div>
        </div>
      )}
    </div>
  )
}
