import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('access_token')
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
      auth: { token },
      transports: ['websocket'],
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
