'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, X, RotateCcw, Check, Loader2, AlertCircle } from 'lucide-react'
import { CameraError, captureFrame, getStream, stopStream } from '@/lib/native/camera'

interface Props {
  open: boolean
  /** Tipo de marcaje (entrada/salida) — solo para texto del header */
  punchType: 'in' | 'out'
  /** Cierra sin enviar (cancelar) */
  onCancel: () => void
  /** El usuario confirmó la selfie. Recibe el dataURL JPEG. */
  onConfirm: (dataUrl: string) => void
}

/**
 * Modal full-screen para tomar selfie de verificación.
 * Flujo:
 *   1. Al abrir: solicita cámara frontal y muestra preview en vivo.
 *   2. Botón captura → freeze frame, mostrar preview con "Repetir"/"Confirmar".
 *   3. Confirmar → onConfirm(dataUrl), padre cierra y envía al servidor.
 *   4. Cancelar (X) → cierra y limpia stream.
 */
export default function SelfieModal({ open, punchType, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Iniciar / detener cámara según prop `open`
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true); setError(null); setSnapshot(null)

    ;(async () => {
      try {
        const stream = await getStream('user')
        if (!alive) { stopStream(stream); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // En iOS Safari el play() puede requerir interacción del usuario;
          // pero como el modal se abre por click del usuario, suele funcionar.
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        const msg = e instanceof CameraError ? e.message : 'Error al activar la cámara'
        if (alive) setError(msg)
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [open])

  function handleCapture() {
    if (!videoRef.current) return
    try {
      const dataUrl = captureFrame(videoRef.current, 0.85)
      setSnapshot(dataUrl)
    } catch (e: any) {
      setError(e.message || 'No se pudo capturar la imagen')
    }
  }

  function handleRetake() {
    setSnapshot(null)
  }

  function handleConfirm() {
    if (snapshot) onConfirm(snapshot)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="dialog" aria-modal="true" aria-label="Capturar selfie">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Camera size={18} />
          <span className="font-semibold text-sm">
            Verificación · {punchType === 'in' ? 'Entrada' : 'Salida'}
          </span>
        </div>
        <button onClick={onCancel}
          aria-label="Cancelar"
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
          <X size={18} />
        </button>
      </div>

      {/* Video / preview */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-sm">Activando cámara…</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-red-500/20 border border-red-400 rounded-2xl p-4 max-w-sm flex items-start gap-3">
              <AlertCircle className="text-red-300 shrink-0 mt-0.5" size={18} />
              <div className="text-sm text-red-100">{error}</div>
            </div>
          </div>
        )}

        {/* Live preview */}
        {!snapshot && (
          <video ref={videoRef} playsInline muted autoPlay
            className={`w-full h-full object-cover ${loading || error ? 'opacity-30' : ''}`}
            style={{ transform: 'scaleX(-1)' }}  /* mirror frontal feed */
          />
        )}

        {/* Snapshot freeze */}
        {snapshot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot} alt="Selfie capturada"
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }} />
        )}

        {/* Guía oval — solo en preview en vivo */}
        {!snapshot && !loading && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-80 rounded-[50%] border-2 border-white/60 border-dashed" />
          </div>
        )}
      </div>

      {/* Controles inferiores */}
      <div className="px-4 py-6 bg-black/80 backdrop-blur-sm">
        {!snapshot ? (
          <div className="flex justify-center">
            <button onClick={handleCapture}
              disabled={loading || !!error}
              aria-label="Tomar foto"
              className="w-20 h-20 rounded-full bg-white border-4 border-white/40
                         hover:scale-105 active:scale-95
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-transform" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleRetake}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl
                         bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors">
              <RotateCcw size={18} /> Repetir
            </button>
            <button onClick={handleConfirm}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl
                         bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors">
              <Check size={18} /> Confirmar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
