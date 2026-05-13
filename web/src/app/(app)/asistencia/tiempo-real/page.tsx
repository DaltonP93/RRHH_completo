'use client'

import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { io, Socket } from 'socket.io-client'

// ─── Types ──────────────────────────────────────────────────────
interface LiveEvent {
  id: string
  employeeCode: string
  employeeName?: string
  timestamp: string
  type: string
  deviceName?: string
  deviceIp?: string
  source?: string
}

interface DeviceStatus {
  id: number
  name: string
  ip: string
  mode?: string
  status?: string
  lastSeen?: string
  lastError?: string
  active?: boolean
  last_heartbeat?: string
  last_event_at?: string
}

function EventTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    in:          'bg-green-100 text-green-800',
    out:         'bg-red-100 text-red-800',
    break_start: 'bg-yellow-100 text-yellow-800',
    break_end:   'bg-blue-100 text-blue-800',
    unknown:     'bg-gray-100 text-gray-600',
  }
  const labels: Record<string, string> = {
    in: 'Entrada', out: 'Salida', break_start: 'Inicio descanso',
    break_end: 'Fin descanso', unknown: 'Desconocido',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[type] || styles.unknown}`}>
      {labels[type] || type}
    </span>
  )
}

function DeviceCard({ device }: { device: DeviceStatus }) {
  const online = device.status === 'online' || (device.last_heartbeat && (Date.now() - new Date(device.last_heartbeat).getTime()) < 5 * 60 * 1000)
  return (
    <div className={`border rounded-lg p-4 ${online ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></span>
        <span className="font-medium text-sm text-gray-900">{device.name}</span>
      </div>
      <p className="text-xs text-gray-500 font-mono">{device.ip}</p>
      {device.mode && <p className="text-xs text-gray-400 mt-1">Modo: {device.mode}</p>}
      {device.last_heartbeat && (
        <p className="text-xs text-gray-400 mt-1">
          Ultimo latido: {new Date(device.last_heartbeat).toLocaleTimeString('es-PY')}
        </p>
      )}
      {device.last_event_at && (
        <p className="text-xs text-gray-400">
          Ultima marcacion: {new Date(device.last_event_at).toLocaleTimeString('es-PY')}
        </p>
      )}
      {!online && device.lastError && (
        <p className="text-xs text-red-600 mt-1 truncate" title={device.lastError}>{device.lastError}</p>
      )}
    </div>
  )
}

export default function TiempoRealPage() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [connected, setConnected] = useState(false)
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0 })
  const [filter, setFilter] = useState<'all'|'in'|'out'|'unknown'>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const socketRef = useRef<Socket | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const MAX_EVENTS = 200

  useEffect(() => {
    loadDevices()
    loadLiveEvents()

    const API_URL = process.env.NEXT_PUBLIC_API_URL || ''
    const token = localStorage.getItem('access_token') || ''
    const socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('attendance:new', (event: any) => {
      const ev: LiveEvent = {
        id: `${Date.now()}-${Math.random()}`,
        employeeCode: event.employeeCode || event.employee_code || '',
        employeeName: event.employeeName || event.employee_name,
        timestamp: event.timestamp,
        type: event.type || 'unknown',
        deviceName: event.deviceName || event.device_name,
        deviceIp: event.deviceIp || event.device_ip,
        source: event.source,
      }
      setEvents(prev => [ev, ...prev].slice(0, MAX_EVENTS))
    })

    socket.on('dashboard:update', (data: any) => {
      if (data.stats) setStats(data.stats)
    })

    socket.on('device:status', (data: any) => {
      setDevices(prev => prev.map(d =>
        d.ip === data.ip ? { ...d, status: data.status, lastError: data.error, lastSeen: data.lastSeen } : d
      ))
    })

    // Polling de dispositivos cada 30s
    const devicePoll = setInterval(loadDevices, 30000)
    // Polling de stats cada 60s
    const statsPoll = setInterval(loadStats, 60000)
    loadStats()

    return () => {
      socket.disconnect()
      clearInterval(devicePoll)
      clearInterval(statsPoll)
    }
  }, [])

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0
    }
  }, [events, autoScroll])

  async function loadDevices() {
    try {
      const { data } = await api.get('/api/devices')
      setDevices(data.data || data || [])
    } catch {}
  }

  async function loadLiveEvents() {
    try {
      const { data } = await api.get('/api/attendance/live')
      const mapped = (data.data || data || []).map((e: any) => ({
        id: String(e.id),
        employeeCode: e.employee_code || e.employeeCode,
        employeeName: e.employee_name || e.employeeName,
        timestamp: e.timestamp,
        type: e.type,
        deviceName: e.device_name,
        source: e.source,
      }))
      setEvents(mapped)
    } catch {}
  }

  async function loadStats() {
    try {
      const { data } = await api.get('/api/attendance?date=' + new Date().toISOString().slice(0, 10))
      if (data.stats) setStats(data.stats)
    } catch {}
  }

  const filteredEvents = filter === 'all' ? events : events.filter(e => e.type === filter)

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asistencia en Tiempo Real</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></span>
            <span className="text-xs text-gray-500">{connected ? 'Conectado — recibiendo eventos' : 'Sin conexion'}</span>
          </div>
        </div>
        <div className="text-xs text-gray-400">{new Date().toLocaleDateString('es-PY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Presentes', value: stats.present, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Ausentes',  value: stats.absent,  color: 'text-red-600',   bg: 'bg-red-50' },
          { label: 'Tardanzas', value: stats.late,    color: 'text-yellow-600',bg: 'bg-yellow-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-lg p-4 text-center`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Feed de marcaciones */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-800">Feed de marcaciones</h2>
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {filteredEvents.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}
                  className="rounded" />
                Auto-scroll
              </label>
              <select value={filter} onChange={e => setFilter(e.target.value as any)}
                className="border rounded px-2 py-1 text-xs">
                <option value="all">Todos</option>
                <option value="in">Entradas</option>
                <option value="out">Salidas</option>
                <option value="unknown">Desconocidos</option>
              </select>
              <button onClick={loadLiveEvents} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
                Recargar
              </button>
            </div>
          </div>

          <div ref={feedRef} className="flex-1 overflow-y-auto border rounded-lg bg-white divide-y divide-gray-50">
            {filteredEvents.length === 0 && (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                Esperando marcaciones...
              </div>
            )}
            {filteredEvents.map(ev => (
              <div key={ev.id} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-4">
                <div className="text-xs text-gray-400 w-24 flex-shrink-0 font-mono">
                  {new Date(ev.timestamp).toLocaleTimeString('es-PY')}
                </div>
                <EventTypeBadge type={ev.type} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {ev.employeeName || ev.employeeCode}
                  </p>
                  {ev.employeeName && (
                    <p className="text-xs text-gray-400">Cod: {ev.employeeCode}</p>
                  )}
                </div>
                <div className="text-xs text-gray-400 text-right flex-shrink-0">
                  <p>{ev.deviceName || ev.deviceIp}</p>
                  {ev.source && <p className="text-gray-300">{ev.source}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel de dispositivos */}
        <div className="w-72 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Relojes</h2>
            <button onClick={loadDevices} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
              Actualizar
            </button>
          </div>
          <div className="space-y-3">
            {devices.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No hay dispositivos registrados</p>
            )}
            {devices.map(d => <DeviceCard key={d.id} device={d} />)}
          </div>

          {/* Leyenda */}
          <div className="mt-6 bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Tipos de marcacion</p>
            {[['in','Entrada','text-green-700'],['out','Salida','text-red-700'],
              ['break_start','Inicio descanso','text-yellow-700'],['break_end','Fin descanso','text-blue-700']].map(([t, l, c]) => (
              <div key={t} className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium ${c}`}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
