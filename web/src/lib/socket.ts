import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

/**
 * Tracks whether the socket has permanently given up after max reconnection
 * attempts. Once true, callers should rely on HTTP polling fallbacks.
 */
let socketFailed = false

/** How many connect_error events have been logged (suppress after the first). */
let connectErrorCount = 0

/** Whether the socket was ever successfully connected in this session. */
let wasEverConnected = false

function socketTarget(): string {
  // Prioridad: SOCKET_URL → API_URL normalizado → mismo origin (https en prod tras nginx)
  let raw = (process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || '').trim()
  raw = raw.replace(/\/+$/, '').replace(/\/api$/i, '')
  if (!raw) {
    if (typeof window !== 'undefined') return window.location.origin
    return process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || ''
  }
  // Forzar https si la página ya es https (evita mixed content)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && raw.startsWith('http://')) {
    raw = 'https://' + raw.slice('http://'.length)
  }
  return raw
}

/** Lee el token de acceso actual desde localStorage */
function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token') || localStorage.getItem('token') || null
}

/**
 * Returns true if the socket permanently failed to connect (max retries exceeded).
 * When true, the UI should rely on polling-based fallbacks.
 */
export function isSocketAvailable(): boolean {
  return !socketFailed
}

export function getSocket(): Socket {
  if (!socket) {
    socketFailed = false
    connectErrorCount = 0
    wasEverConnected = false

    socket = io(socketTarget(), {
      // auth como función → se evalúa en CADA intento de conexión/reconexión
      // Esto garantiza que el token esté vigente aunque se cree antes del login
      auth: (cb) => cb({ token: getToken() }),
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    })

    socket.on('connect', () => {
      console.log('Socket conectado:', socket?.id)
      socketFailed = false
      connectErrorCount = 0
      wasEverConnected = true
    })

    socket.on('disconnect', (reason) => {
      // Only log if the socket had previously connected — avoids noise for
      // environments where WebSocket upgrades are blocked at the proxy level.
      if (wasEverConnected) {
        console.warn('Socket desconectado:', reason)
      }
    })

    socket.on('connect_error', (err) => {
      connectErrorCount++
      if (connectErrorCount === 1) {
        // Log only the first error to avoid spamming the console
        console.warn('Socket no disponible (modo fallback a polling):', err.message)
      }
      // Si el token es inválido, advertir una sola vez
      if (err.message === 'Token inválido' || err.message === 'Token requerido') {
        if (connectErrorCount === 1) {
          console.warn('Socket: token rechazado, se reintentará con token actualizado')
        }
      }
    })

    socket.io.on('reconnect_failed', () => {
      socketFailed = true
      console.warn('Socket: máximo de reintentos alcanzado. Usando polling como fallback.')
    })
  }

  // Si el socket existe, NO forzar reconexión cuando ya falló permanentemente
  if (socket && !socket.connected && !socketFailed) {
    socket.auth = (cb: (data: object) => void) => cb({ token: getToken() })
    socket.connect()
  }

  return socket
}

/** Desconectar y limpiar (usar al hacer logout) */
export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  socketFailed = false
  connectErrorCount = 0
  wasEverConnected = false
}

/** Reconectar con token actualizado (usar tras login/refresh de token) */
export function reconnectSocket() {
  if (socket) {
    socketFailed = false
    connectErrorCount = 0
    socket.auth = (cb: (data: object) => void) => cb({ token: getToken() })
    socket.disconnect()
    socket.connect()
  }
}
