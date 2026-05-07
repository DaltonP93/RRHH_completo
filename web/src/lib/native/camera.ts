/**
 * lib/native/camera.ts
 *
 * Capa de abstracción para acceso a cámara.
 * - Hoy delega a navigator.mediaDevices.getUserMedia.
 * - En Fase 2 (Capacitor) este archivo migra a @capacitor/camera para
 *   selfies (takePhoto), manteniendo getStream() para QR scanning con
 *   BarcodeDetector (que sigue siendo Web).
 */

export type CameraFacing = 'user' | 'environment'

export type CameraErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'IN_USE'
  | 'OVERCONSTRAINED'
  | 'INSECURE_CONTEXT'
  | 'UNSUPPORTED'
  | 'OTHER'

export class CameraError extends Error {
  code: CameraErrorCode
  constructor(code: CameraErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Obtiene un MediaStream de la cámara. El consumidor es responsable
 * de detenerlo con stopStream().
 *
 * @throws CameraError con código legible
 */
export async function getStream(facing: CameraFacing = 'user'): Promise<MediaStream> {
  // Insecure context — getUserMedia requiere HTTPS (excepto localhost)
  if (typeof window !== 'undefined'
      && window.isSecureContext === false
      && location.hostname !== 'localhost') {
    throw new CameraError('INSECURE_CONTEXT',
      'La cámara requiere HTTPS. Accedé al sitio con https://')
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('UNSUPPORTED',
      'Tu navegador no soporta acceso a la cámara. En iOS usá Safari, en Android Chrome.')
  }

  // iOS prefiere `{ ideal: 'user' }` antes que string. Width/height ideal
  // permiten que el navegador escoja la mejor resolución soportada.
  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: facing },
      width:      { ideal: 1280 },
      height:     { ideal: 720 },
    },
    audio: false,
  }

  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (e: any) {
    // Reintento sin restricciones de resolución si falla por OverconstrainedError
    if (e?.name === 'OverconstrainedError') {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        })
      } catch (e2: any) {
        throw mapError(e2)
      }
    }
    throw mapError(e)
  }
}

/**
 * Captura un frame del <video> activo a JPEG dataURL.
 * El video debe estar reproduciéndose (videoWidth>0).
 */
export function captureFrame(video: HTMLVideoElement, quality = 0.85): string {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('El video aún no está listo. Esperá un momento e intentá de nuevo.')
  }
  const c = document.createElement('canvas')
  c.width  = video.videoWidth
  c.height = video.videoHeight
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear contexto de canvas')
  ctx.drawImage(video, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', quality)
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(t => t.stop())
}

function mapError(e: any): CameraError {
  const name = e?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return new CameraError('PERMISSION_DENIED',
      'Permiso de cámara denegado. Revisá los ajustes del navegador (Safari/Chrome) y del sistema.')
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new CameraError('NOT_FOUND', 'No se encontró cámara en este dispositivo')
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new CameraError('IN_USE',
      'La cámara está siendo usada por otra app. Cerrá otras aplicaciones y reintentá.')
  }
  if (name === 'OverconstrainedError') {
    return new CameraError('OVERCONSTRAINED', 'Resolución no soportada por la cámara')
  }
  if (name === 'SecurityError') {
    return new CameraError('INSECURE_CONTEXT', 'Contexto inseguro. Necesitás HTTPS para usar la cámara.')
  }
  return new CameraError('OTHER', e?.message || 'No se pudo activar la cámara')
}
