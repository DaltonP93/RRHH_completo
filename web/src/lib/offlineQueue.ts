/**
 * offlineQueue.ts — Cola simple de marcajes offline en localStorage.
 *
 * Cuando el empleado intenta marcar pero no hay red, el marcaje se
 * guarda local y se reintenta automáticamente cuando vuelve la conexión.
 */

import { api } from './api'

const KEY = 'sishoras_offline_punches'

export interface PendingPunch {
  id: string                // uuid local
  type: 'in' | 'out'
  token?: string
  lat?: number
  lng?: number
  selfie?: string           // dataURL (cuidado con localStorage 5MB)
  client_timestamp: string  // ISO
  attempts: number
}

export function listPending(): PendingPunch[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function save(items: PendingPunch[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* quota */ }
}

export function enqueue(p: Omit<PendingPunch, 'id' | 'attempts' | 'client_timestamp'>): PendingPunch {
  const item: PendingPunch = {
    ...p,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    client_timestamp: new Date().toISOString(),
    attempts: 0,
  }
  // Limpiar selfie si es muy grande (>200KB) para evitar quota exceeded
  if (item.selfie && item.selfie.length > 200_000) delete item.selfie
  const items = listPending()
  items.push(item)
  save(items)
  return item
}

export function remove(id: string) {
  save(listPending().filter(p => p.id !== id))
}

export function clear() {
  save([])
}

/**
 * Reintenta enviar todos los marcajes pendientes. Devuelve resumen.
 */
export async function flush(): Promise<{ sent: number; failed: number; errors: string[] }> {
  const items = listPending()
  const errors: string[] = []
  let sent = 0, failed = 0
  for (const p of items) {
    try {
      await api.post('/api/self-checkin/mark', {
        type: p.type,
        token: p.token,
        lat: p.lat,
        lng: p.lng,
        selfie: p.selfie,
      })
      remove(p.id)
      sent++
    } catch (err: any) {
      p.attempts = (p.attempts || 0) + 1
      failed++
      errors.push(err?.response?.data?.error || err?.message || 'Error desconocido')
      // Si tiene >5 intentos fallidos, dejarlo pero no bloquear el flush
      save(listPending().map(x => x.id === p.id ? p : x))
    }
  }
  return { sent, failed, errors }
}

/**
 * Hook utilitario: indica si estamos online y reintenta automáticamente
 * el queue al recuperar la conexión.
 */
export function setupAutoRetry() {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => {
    if (listPending().length > 0) {
      flush().then(r => {
        if (r.sent > 0) {
          window.dispatchEvent(new CustomEvent('sishoras:queue-flushed', { detail: r }))
        }
      })
    }
  })
}
