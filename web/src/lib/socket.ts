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
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && raw.startsWith('http://')) {
    raw = 'https://' + raw.slice('http://'.length)
  }
  return raw
}

export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('access_token') || localStorage.getItem('token'))
      : null
    socket = io(socketTarget(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    })

    socket.on('connect', () => console.log('🔌 Socket conectado'))
    socket.on('disconnect', () => console.log('🔌 Socket desconectado'))
    socket.on('connect_error', (err) => console.error('Socket error:', err.message))
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
