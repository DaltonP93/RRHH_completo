'use client'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Wifi, WifiOff, AlertCircle, RefreshCw, Database, Server, Activity, Clock } from 'lucide-react'

interface DeviceStatus {
  id: number
  name: string
  ip: string
  port: number
  source: 'database' | 'env' | 'hardcoded'
  lastSync: string | null
  marcaciones: number
  lastError: string | null
  bridgeStatus: 'online' | 'offline' | 'unknown'
  uiStatus: 'online' | 'offline' | 'unknown'
}

interface BridgeHealth {
  status: string
  devices: number
  uptime?: number
}

function StatusBadge({ status }: { status: 'online' | 'offline' | 'unknown' }) {
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
        <Wifi size={11} /> online
      </span>
    )
  }
  if (status === 'offline') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <WifiOff size={11} /> offline
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
      <AlertCircle size={11} /> desconocido
    </span>
  )
}

function SourceBadge({ source }: { source: DeviceStatus['source'] }) {
  const map: Record<DeviceStatus['source'], { label: string; cls: string; Icon: typeof Database }> = {
    database: { label: 'BD',         cls: 'bg-blue-50 text-blue-700',   Icon: Database },
    env:      { label: 'ENV',        cls: 'bg-amber-50 text-amber-700', Icon: Server   },
    hardcoded:{ label: 'hardcoded',  cls: 'bg-red-50 text-red-700',     Icon: AlertCircle },
  }
  const { label, cls, Icon } = map[source] ?? map.database
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Icon size={11} /> {label}
    </span>
  )
}

export default function DiagnosticoRelojesPage() {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [devRes, healthRes] = await Promise.allSettled([
        api.get('/api/devices'),
        api.get('/api/health'),
      ])

      // Process health
      let health: BridgeHealth | null = null
      if (healthRes.status === 'fulfilled') {
        const h = healthRes.value?.data ?? healthRes.value
        health = {
          status: h?.status ?? 'unknown',
          devices: h?.bridge?.devices ?? h?.devices ?? 0,
          uptime: h?.bridge?.uptime ?? h?.uptime,
        }
        setBridgeHealth(health)
      }

      // Process devices
      if (devRes.status === 'fulfilled') {
        const raw: unknown[] = devRes.value?.data ?? devRes.value ?? []
        const list: DeviceStatus[] = (Array.isArray(raw) ? raw : []).map((d: unknown) => {
          const dev = d as Record<string, unknown>
          return {
            id:           Number(dev.id ?? 0),
            name:         String(dev.name ?? dev.nombre ?? '—'),
            ip:           String(dev.ip ?? dev.ip_address ?? '—'),
            port:         Number(dev.port ?? dev.puerto ?? 4370),
            source:       (dev.source ?? 'database') as DeviceStatus['source'],
            lastSync:     dev.last_sync as string | null ?? dev.lastSync as string | null ?? null,
            marcaciones:  Number(dev.marcaciones ?? dev.attendance_count ?? 0),
            lastError:    dev.last_error as string | null ?? dev.lastError as string | null ?? null,
            bridgeStatus: (health && health.devices > 0 ? 'unknown' : 'offline') as DeviceStatus['bridgeStatus'],
            uiStatus:     (dev.status ?? dev.estado ?? 'unknown') as DeviceStatus['uiStatus'],
          }
        })
        setDevices(list)
      } else {
        setDevices([])
        setError('No se pudo obtener la lista de dispositivos del servidor.')
      }
    } catch (e) {
      setError(`Error al conectar con la API: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
      setLastFetched(new Date())
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={22} className="text-emerald-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-800">Diagnóstico de Relojes ZKTeco</h1>
            {lastFetched && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <Clock size={11} />
                Actualizado: {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar diagnóstico
        </button>
      </div>

      {/* Info Banner */}
      <div className="flex gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong>Importante:</strong> Si Bridge dice <code className="bg-amber-100 px-1 rounded">devices: 0</code> pero
          la UI muestra relojes, significa que los dispositivos están en la BD pero el Bridge no tiene configuradas
          las IPs en <code className="bg-amber-100 px-1 rounded">ZKTECO_DEVICES</code>, o los dispositivos no son
          accesibles en red desde el servidor.
        </p>
      </div>

      {/* Bridge Health Card */}
      {bridgeHealth && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3">
            <Server size={18} className="text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Estado Bridge</p>
              <p className={`text-sm font-semibold ${bridgeHealth.status === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
                {bridgeHealth.status}
              </p>
            </div>
          </div>
          <div className="col-span-1 bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3">
            <Wifi size={18} className={bridgeHealth.devices > 0 ? 'text-emerald-500' : 'text-red-400'} />
            <div>
              <p className="text-xs text-slate-500">Dispositivos en Bridge</p>
              <p className={`text-sm font-semibold ${bridgeHealth.devices > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {bridgeHealth.devices}
              </p>
            </div>
          </div>
          <div className="col-span-1 bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3">
            <Database size={18} className="text-blue-400" />
            <div>
              <p className="text-xs text-slate-500">Dispositivos en BD</p>
              <p className="text-sm font-semibold text-blue-700">{loading ? '…' : devices.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mismatch warning */}
      {bridgeHealth && bridgeHealth.devices === 0 && devices.length > 0 && (
        <div className="flex gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <WifiOff size={16} className="flex-shrink-0 mt-0.5" />
          <p>
            <strong>Discrepancia detectada:</strong> La BD tiene <strong>{devices.length}</strong> reloj(es) configurado(s)
            pero el Bridge reporta <strong>0</strong> dispositivos activos. Verifique la variable de entorno{' '}
            <code className="bg-red-100 px-1 rounded">ZKTECO_DEVICES</code> en el servidor del Bridge (puerto 8081).
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error de comunicación</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && devices.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-lg p-10 text-center space-y-3">
          <WifiOff size={32} className="mx-auto text-slate-300" />
          <p className="font-medium text-slate-600">No se encontraron dispositivos configurados</p>
          <p className="text-sm text-slate-400">
            Configure relojes en <strong>Configuración → Relojes</strong> o agregue IPs en la variable{' '}
            <code className="bg-slate-100 px-1 rounded">ZKTECO_DEVICES</code>.
          </p>
        </div>
      )}

      {/* Device Table */}
      {!loading && devices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Dispositivos detectados — {devices.length} reloj(es)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <th className="px-4 py-2 text-left font-medium">Nombre</th>
                  <th className="px-4 py-2 text-left font-medium">IP</th>
                  <th className="px-4 py-2 text-left font-medium">Puerto</th>
                  <th className="px-4 py-2 text-left font-medium">Origen</th>
                  <th className="px-4 py-2 text-left font-medium">Último Sync</th>
                  <th className="px-4 py-2 text-right font-medium">Marcaciones</th>
                  <th className="px-4 py-2 text-center font-medium">Estado Bridge</th>
                  <th className="px-4 py-2 text-center font-medium">Estado UI</th>
                  <th className="px-4 py-2 text-left font-medium">Último Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{dev.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{dev.ip}</td>
                    <td className="px-4 py-3 text-slate-500">{dev.port}</td>
                    <td className="px-4 py-3"><SourceBadge source={dev.source} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {dev.lastSync
                        ? new Date(dev.lastSync).toLocaleString()
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{dev.marcaciones.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={dev.bridgeStatus} /></td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={dev.uiStatus} /></td>
                    <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate" title={dev.lastError ?? ''}>
                      {dev.lastError ?? <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-slate-100 rounded" />
          ))}
        </div>
      )}
    </div>
  )
}
