import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

function socketTarget(): string {
  // Prioridad: SOCKET_URL → API_URL normalizado → mismo origin (https en prod tras nginx)
  let raw = (process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || '').trim()
  raw = raw.replace(/\/+$/, '').replace(/\/api$/i, '')
  if (!raw) {
    if (typeof window !== 'undefined') return window.location.origin
    return 'http://localhost:4000'
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

export function getSocket(): Socket {
  if (!socket) {
    socket = io(socketTarget(), {
      // auth como función → se evalúa en CADA intento de conexión/reconexión
      // Esto garantiza que el token esté vigente aunque se cree antes del login
      auth: (cb) => cb({ token: getToken() }),
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    })

    socket.on('connect', () => {
      console.log('🔌 Socket conectado:', socket?.id)
    })

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket desconectado:', reason)
    })

    socket.on('connect_error', (err) => {
      console.error('❌ Socket error:', err.message)
      // Si el token es inválido, limpiar el socket para que se recree con token nuevo
      if (err.message === 'Token inválido' || err.message === 'Token requerido') {
        console.warn('Socket: token rechazado, se reintentará con token actualizado')
      }
    })
  }

  // Si el socket existe pero está desconectado, reconectar con token actualizado
  if (socket && !socket.connected) {
    socket.auth = (cb: (data: object) => void) => cb({ token: getToken() })
    socket.connect()
  }

  return socket
}

/** Desconectar y limpiar (usar al hacer logout) */
export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

/** Reconectar con token actualizado (usar tras login/refresh de token) */
export function reconnectSocket() {
  if (socket) {
    socket.auth = (cb: (data: object) => void) => cb({ token: getToken() })
    socket.disconnect()
    socket.connect()
  }
}
