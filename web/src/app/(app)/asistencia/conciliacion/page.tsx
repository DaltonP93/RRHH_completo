'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle, RefreshCw, Clock, Database, Wifi, WifiOff, Users } from 'lucide-react'

interface DiagnosticData {
  ok: boolean
  date: string
  sync_lag_hours: number | null
  last_raw_event_at: string | null
  last_processed_event_at: string | null
  warnings: string[]
  sources: {
    att2000: {
      available: boolean
      total: number | null
      today: number | null
      users_in_userinfo: number | null
      last_event_at: string | null
      last_event_user: string | null
    }
    zkteco_bridge: {
      available: boolean
      devices: number
      bridge_devices_expected: number
      bridge_devices_detected: number
      last_poll_at: string | null
      raw_events_today: number
    }
    local_raw: {
      total: number
      today: number
      by_source: Array<{ source: string; cnt: number }>
    }
    processed: {
      daily_summary_today: number
      absent_today: number
    }
  }
  mapping: {
    employees_active: number
    employees_with_code: number
    employees_without_code: number
    unmatched_punches_total: number
  }
  samples: {
    latest_raw: Array<{
      id: number
      employee_id: number
      timestamp: string
      type: string
      source: string
      employee_name: string
    }>
    latest_processed: Array<{
      employee_id: number
      date: string
      first_in: string | null
      last_out: string | null
      worked_minutes: number | null
      late_minutes: number | null
      status: string
      employee_name: string
    }>
    unmatched: Array<{
      source_user_id: string
      badge_number: string
      check_time: string
    }>
  }
}

const STATUS_COLOR: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  absent:  'bg-red-100 text-red-800',
  late:    'bg-yellow-100 text-yellow-800',
  permission: 'bg-blue-100 text-blue-800',
  holiday: 'bg-purple-100 text-purple-800',
  weekend: 'bg-gray-100 text-gray-700',
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return ts }
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {label}
    </span>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export default function ConciliacionPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [data, setData] = useState<DiagnosticData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || ''
      const res = await fetch(`/api/attendance/reconciliation-diagnostics?date=${d}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conciliación de Marcaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Diagnóstico de la cadena att2000 → logs → daily_summary</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            max={today}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => load(date)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Warnings */}
      {data && data.warnings.length > 0 && (
        <div className="space-y-2">
          {data.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Lag banner */}
      {data && data.sync_lag_hours !== null && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${data.sync_lag_hours > 24 ? 'bg-red-100 text-red-800' : data.sync_lag_hours > 4 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
          <Clock className="w-4 h-4" />
          Último evento raw hace <strong className="mx-1">{data.sync_lag_hours}h</strong>
          {data.last_raw_event_at && <span className="opacity-70">({fmtTs(data.last_raw_event_at)})</span>}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* att2000 */}
          <Card title="att2000 SQL Server">
            <div className="space-y-3">
              <StatusBadge ok={data.sources.att2000.available} label={data.sources.att2000.available ? 'Conectado' : 'Sin conexión'} />
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Stat label="Total marcaciones" value={data.sources.att2000.total?.toLocaleString() ?? '—'} />
                <Stat label="Hoy" value={data.sources.att2000.today ?? '—'} />
                <Stat label="Usuarios USERINFO" value={data.sources.att2000.users_in_userinfo ?? '—'} />
                <Stat label="Último evento" value={fmtTs(data.sources.att2000.last_event_at)} sub={data.sources.att2000.last_event_user ? `USERID ${data.sources.att2000.last_event_user}` : undefined} />
              </div>
            </div>
          </Card>

          {/* Bridge ZKTeco */}
          <Card title="Bridge ZKTeco">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusBadge ok={data.sources.zkteco_bridge.available} label={data.sources.zkteco_bridge.available ? 'Disponible' : 'Sin dispositivos'} />
                {data.sources.zkteco_bridge.devices > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Wifi className="w-3 h-3" />{data.sources.zkteco_bridge.devices} reloj(es)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Stat label="Esperados (ENV)" value={data.sources.zkteco_bridge.bridge_devices_expected} />
                <Stat label="En BD" value={data.sources.zkteco_bridge.bridge_devices_detected} />
                <Stat label="Eventos hoy (device)" value={data.sources.zkteco_bridge.raw_events_today} />
                <Stat label="Última poll" value={fmtTs(data.sources.zkteco_bridge.last_poll_at)} />
              </div>
            </div>
          </Card>

          {/* Local raw */}
          <Card title="attendance_logs (local)">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total" value={data.sources.local_raw.total.toLocaleString()} />
                <Stat label="Hoy" value={data.sources.local_raw.today} />
              </div>
              {data.sources.local_raw.by_source.length > 0 ? (
                <div className="pt-1 space-y-1">
                  <p className="text-xs text-gray-500 font-medium">Por fuente (hoy)</p>
                  {data.sources.local_raw.by_source.map(s => (
                    <div key={s.source} className="flex justify-between text-sm">
                      <span className="text-gray-600">{s.source}</span>
                      <span className="font-medium">{s.cnt}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 pt-1">Sin marcaciones hoy</p>
              )}
            </div>
          </Card>

          {/* Procesado */}
          <Card title="daily_summary (procesado)">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Registros hoy" value={data.sources.processed.daily_summary_today} />
                <Stat label="Ausentes hoy" value={data.sources.processed.absent_today} />
              </div>
              <Stat label="Último procesado" value={fmtTs(data.last_processed_event_at)} />
            </div>
          </Card>
        </div>
      )}

      {/* Mapeo de empleados */}
      {data && (
        <Card title="Mapeo de Empleados">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Empleados activos" value={<span className="flex items-center gap-1"><Users className="w-4 h-4 text-gray-400" />{data.mapping.employees_active}</span>} />
            <Stat
              label="Con código ZKTeco"
              value={data.mapping.employees_with_code}
              sub={`${Math.round(data.mapping.employees_with_code / Math.max(data.mapping.employees_active, 1) * 100)}% del total`}
            />
            <Stat label="Sin código" value={<span className={data.mapping.employees_without_code > 0 ? 'text-red-600' : 'text-gray-900'}>{data.mapping.employees_without_code}</span>} />
            <Stat label="Marcaciones sin mapeo" value={<span className={data.mapping.unmatched_punches_total > 0 ? 'text-amber-600' : 'text-gray-900'}>{data.mapping.unmatched_punches_total}</span>} />
          </div>
        </Card>
      )}

      {/* Muestras */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Últimas marcaciones raw */}
          <Card title={`Últimas marcaciones (attendance_logs)`}>
            {data.samples.latest_raw.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="text-left pb-2 pr-3">Timestamp</th>
                      <th className="text-left pb-2 pr-3">Empleado</th>
                      <th className="text-left pb-2 pr-3">Tipo</th>
                      <th className="text-left pb-2">Fuente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.samples.latest_raw.map(r => (
                      <tr key={r.id}>
                        <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{fmtTs(r.timestamp)}</td>
                        <td className="py-1.5 pr-3 text-gray-900">{r.employee_name || `#${r.employee_id}`}</td>
                        <td className="py-1.5 pr-3"><span className={`px-1.5 py-0.5 rounded text-xs ${r.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{r.type}</span></td>
                        <td className="py-1.5 text-gray-500">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Últimos registros procesados */}
          <Card title={`Registros procesados — ${date}`}>
            {data.samples.latest_processed.length === 0 ? (
              <p className="text-sm text-gray-400">Sin registros procesados para esta fecha</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="text-left pb-2 pr-3">Empleado</th>
                      <th className="text-left pb-2 pr-3">Entrada</th>
                      <th className="text-left pb-2 pr-3">Salida</th>
                      <th className="text-left pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.samples.latest_processed.map(r => (
                      <tr key={r.employee_id}>
                        <td className="py-1.5 pr-3 text-gray-900">{r.employee_name || `#${r.employee_id}`}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{fmtTs(r.first_in)}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{fmtTs(r.last_out)}</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-700'}`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Marcaciones sin mapeo */}
      {data && data.samples.unmatched.length > 0 && (
        <Card title={`Marcaciones sin empleado mapeado (${data.mapping.unmatched_punches_total} total)`}>
          <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 rounded text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Estos USERID de ZKTeco no tienen un empleado con <code className="font-mono">employees.code</code> equivalente.
            Asignar el código correcto en la ficha del empleado.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left pb-2 pr-3">USERID (ZKTeco)</th>
                  <th className="text-left pb-2 pr-3">Badge Number</th>
                  <th className="text-left pb-2">Última marcación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.samples.unmatched.map((u, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 font-mono text-gray-900">{u.source_user_id}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{u.badge_number || '—'}</td>
                    <td className="py-1.5 text-gray-600">{fmtTs(u.check_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Acciones rápidas */}
      {data && (
        <Card title="Acciones de Corrección">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a href="/sync/att2000" className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <Database className="w-4 h-4 text-gray-400" />
              <span>Importar desde att2000</span>
            </a>
            <button
              onClick={async () => {
                const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || ''
                await fetch('/api/attendance/recalc-summary', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ date }),
                })
                load(date)
              }}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" />
              <span>Recalcular daily_summary</span>
            </button>
            <a href="/asistencia/relojes/diagnostico" className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <Wifi className="w-4 h-4 text-gray-400" />
              <span>Diagnóstico de relojes</span>
            </a>
          </div>
        </Card>
      )}
    </div>
  )
}
