/**
 * lib/native/geolocation.ts
 *
 * Capa de abstracción para acceso a GPS.
 * - Hoy delega a navigator.geolocation (Web).
 * - En Fase 2 (Capacitor) este archivo será el único punto de cambio:
 *   if (Capacitor?.isNativePlatform()) → usar @capacitor/geolocation.
 *
 * Mantén la API pública de este módulo estable. El resto del código
 * (hooks, componentes, páginas) consume esta capa, no navigator directamente.
 */

export interface Coords {
  latitude:  number
  longitude: number
  accuracy:  number   // metros
  timestamp: number
}

export type GeoErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED'

export class GeoError extends Error {
  code: GeoErrorCode
  constructor(code: GeoErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Obtiene la posición actual con alta precisión.
 * @throws GeoError con .code legible.
 */
export async function getCurrentPosition(opts?: { timeout?: number; maximumAge?: number }): Promise<Coords> {
  // TODO Fase 2 — Capacitor:
  // const Capacitor = (globalThis as any).Capacitor
  // if (Capacitor?.isNativePlatform?.()) {
  //   const { Geolocation } = await import('@capacitor/geolocation')
  //   const r = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
  //   return { latitude: r.coords.latitude, longitude: r.coords.longitude,
  //            accuracy: r.coords.accuracy, timestamp: r.timestamp }
  // }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GeoError('UNSUPPORTED', 'Geolocalización no soportada en este navegador')
  }

  return new Promise<Coords>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy:  pos.coords.accuracy,
        timestamp: pos.timestamp,
      }),
      err => reject(mapError(err)),
      {
        enableHighAccuracy: true,
        timeout:            opts?.timeout    ?? 12_000,
        maximumAge:         opts?.maximumAge ?? 0,
      }
    )
  })
}

/**
 * Suscribe a cambios continuos. Devuelve función de cleanup.
 */
export function watchPosition(
  onUpdate: (c: Coords) => void,
  onError?: (e: GeoError) => void
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError?.(new GeoError('UNSUPPORTED', 'Geolocalización no soportada'))
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    pos => onUpdate({
      latitude:  pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy:  pos.coords.accuracy,
      timestamp: pos.timestamp,
    }),
    err => onError?.(mapError(err)),
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 }
  )
  return () => navigator.geolocation.clearWatch(id)
}

/**
 * Distancia haversine entre dos puntos (metros).
 * Útil para validar geofence en cliente antes de enviar al server.
 */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6_371_000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(b.latitude  - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const x = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function mapError(e: GeolocationPositionError): GeoError {
  switch (e.code) {
    case 1: return new GeoError('PERMISSION_DENIED',     'Permiso de ubicación denegado')
    case 2: return new GeoError('POSITION_UNAVAILABLE',  'GPS no disponible. Verificá la señal.')
    case 3: return new GeoError('TIMEOUT',               'Tiempo de espera agotado obteniendo ubicación')
    default: return new GeoError('POSITION_UNAVAILABLE', e.message || 'Error desconocido de GPS')
  }
}
