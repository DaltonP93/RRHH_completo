'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { AlertTriangle, CheckCircle, RefreshCw, Clock, Database, Wifi, WifiOff, Users, Download, Play, XCircle } from 'lucide-react'

interface DiagnosticData {
  ok: boolean
  date: string
  sync_lag_hours: number | null
  last_raw_event_at: string | null
  last_processed_event_at: string | null
  warnings: string[]
  duplicates?: {
    attendance_logs_duplicates_today: number
    top_duplicate_samples: Array<{ employee_id: number; timestamp: string; copies: number }>
  }
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
      employees_with_only_in: number
      employees_with_only_out: number
      employees_out_before_in: number
    }
  }
  mapping: {
    employees_active: number
    employees_with_code: number
    employees_without_code: number
    employees_no_department: number
    employees_no_name: number
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

interface ImportResult {
  ok: boolean
  date_from?: string
  date_to?: string
  source_total?: number
  local_existing?: number
  inserted?: number
  skipped_duplicates?: number
  not_found_employees?: number
  recalculated_days?: string[]
  message?: string
  warning?: string
  error?: string
}

const STATUS_COLOR: Record<string, string> = {
  present:    'bg-green-100 text-green-800',
  absent:     'bg-red-100 text-red-800',
  late:       'bg-yellow-100 text-yellow-800',
  permission: 'bg-blue-100 text-blue-800',
  holiday:    'bg-purple-100 text-purple-800',
  weekend:    'bg-gray-100 text-gray-700',
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

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className ?? ''}`}>
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

// ─── Import Panel ──────────────────────────────────────────────────────────────
function ImportPanel({ onDone }: { onDone: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo,   setDateTo]   = useState(today)
  const [mode, setMode] = useState<'import_recalc' | 'recalc_only'>('import_recalc')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const run = async () => {
    setRunning(true)
    setResult(null)
    try {
      const endpoint = mode === 'import_recalc'
        ? '/api/attendance/import-att2000'
        : '/api/attendance/recalc-range'
      const { data } = await api.post(endpoint, { date_from: dateFrom, date_to: dateTo })
      setResult(data)
      if (data.ok) onDone()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (e as { message?: string })?.message ?? 'Error de red'
      setResult({ ok: false, error: msg })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card title="Importar y Recalcular">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input type="date" value={dateFrom} max={today}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input type="date" value={dateTo} max={today} min={dateFrom}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Operación</label>
            <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="import_recalc">Importar att2000 + Recalcular</option>
              <option value="recalc_only">Solo recalcular (sin importar)</option>
            </select>
          </div>
        </div>

        <button
          onClick={run} disabled={running}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {running
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Procesando…</>
            : <><Play className="w-4 h-4" />{mode === 'import_recalc' ? 'Importar y recalcular' : 'Recalcular'}</>
          }
        </button>

        {result && (
          <div className={`rounded-lg p-4 ${result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
              <span className={`text-sm font-medium ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
                {result.ok ? 'Completado' : 'Error'}
              </span>
            </div>
            {result.error   && <p className="text-sm text-red-700">{result.error}</p>}
            {result.warning && <p className="text-sm text-amber-700">{result.warning}</p>}
            {result.message && <p className="text-sm text-green-700">{result.message}</p>}
            {result.source_total !== undefined && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                <div><p className="text-gray-500">En att2000</p><p className="font-bold">{result.source_total}</p></div>
                <div><p className="text-gray-500">Ya locales</p><p className="font-bold">{result.local_existing ?? '—'}</p></div>
                <div><p className="text-gray-500">Nuevas</p><p className="font-bold text-green-700">{result.inserted ?? 0}</p></div>
                <div><p className="text-gray-500">Sin empleado</p><p className="font-bold text-amber-600">{result.not_found_employees ?? 0}</p></div>
              </div>
            )}
            {result.recalculated_days && result.recalculated_days.length > 0 && (
              <p className="text-xs text-gray-600 mt-2">
                Recalculado: {result.recalculated_days.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
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
      const { data: resp } = await api.get(`/api/attendance/reconciliation-diagnostics?date=${d}`)
      setData(resp)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (e as { message?: string })?.message ?? 'Error desconocido'
      setError(msg)
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
            type="date" value={date} max={today}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => load(date)} disabled={loading}
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

      {/* Import/recalc panel — always visible */}
      <ImportPanel onDone={() => load(date)} />

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
                <Stat label="Último evento" value={fmtTs(data.sources.att2000.last_event_at)}
                  sub={data.sources.att2000.last_event_user ? `USERID ${data.sources.att2000.last_event_user}` : undefined} />
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
              {(data.sources.processed.employees_out_before_in > 0 ||
                data.sources.processed.employees_with_only_out > 0) && (
                <div className="pt-1 space-y-1 border-t border-gray-100">
                  {data.sources.processed.employees_out_before_in > 0 && (
                    <p className="text-xs text-red-600">⚠ {data.sources.processed.employees_out_before_in} salida anterior a entrada</p>
                  )}
                  {data.sources.processed.employees_with_only_out > 0 && (
                    <p className="text-xs text-amber-600">⚠ {data.sources.processed.employees_with_only_out} solo salida (sin entrada)</p>
                  )}
                  {data.sources.processed.employees_with_only_in > 0 && (
                    <p className="text-xs text-blue-600">ℹ {data.sources.processed.employees_with_only_in} solo entrada (sin salida)</p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Mapeo de empleados */}
      {data && (
        <Card title="Estado de Empleados">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Stat label="Activos" value={<span className="flex items-center gap-1"><Users className="w-4 h-4 text-gray-400" />{data.mapping.employees_active}</span>} />
            <Stat
              label="Con código ZKTeco"
              value={data.mapping.employees_with_code}
              sub={`${Math.round(data.mapping.employees_with_code / Math.max(data.mapping.employees_active, 1) * 100)}%`}
            />
            <Stat label="Sin código"
              value={<span className={data.mapping.employees_without_code > 0 ? 'text-red-600' : ''}>{data.mapping.employees_without_code}</span>} />
            <Stat label="Sin departamento"
              value={<span className={data.mapping.employees_no_department > 0 ? 'text-amber-600' : ''}>{data.mapping.employees_no_department}</span>} />
            <Stat label="Sin nombre"
              value={<span className={data.mapping.employees_no_name > 0 ? 'text-amber-600' : ''}>{data.mapping.employees_no_name}</span>} />
            <Stat label="Punches sin mapeo"
              value={<span className={data.mapping.unmatched_punches_total > 0 ? 'text-amber-600' : ''}>{data.mapping.unmatched_punches_total}</span>} />
          </div>
        </Card>
      )}

      {/* Muestras */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Últimas marcaciones (attendance_logs)">
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
                        <td className="py-1.5 pr-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${r.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{r.type}</span>
                        </td>
                        <td className="py-1.5 text-gray-500">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

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

      {/* Duplicados en attendance_logs */}
      {data && (data.duplicates?.attendance_logs_duplicates_today ?? 0) > 0 && (
        <Card title={`Duplicados en attendance_logs — ${data.duplicates!.attendance_logs_duplicates_today} par(es)`}>
          <div className="flex items-start gap-2 mb-3 p-2 bg-red-50 rounded text-xs text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Hay marcaciones duplicadas. Aplicar la migración 086 para limpiarlos y agregar la restricción única.
            <code className="ml-1 font-mono">mysql asistencia &lt; database/migrations/086_fix_attendance_logs_deduplication.sql</code>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left pb-2 pr-3">Empleado ID</th>
                  <th className="text-left pb-2 pr-3">Timestamp</th>
                  <th className="text-left pb-2">Copias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.duplicates!.top_duplicate_samples.map((d, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 text-gray-900">#{d.employee_id}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{fmtTs(d.timestamp)}</td>
                    <td className="py-1.5 font-bold text-red-600">{d.copies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Marcaciones sin mapeo */}
      {data && data.samples.unmatched.length > 0 && (
        <Card title={`Marcaciones sin empleado mapeado (${data.mapping.unmatched_punches_total} total)`}>
          <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 rounded text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Estos USERID de ZKTeco no tienen un empleado con <code className="font-mono">employees.code</code> equivalente.
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

      {/* Links rápidos */}
      <Card title="Navegación rápida">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a href="/sync/att2000" className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Database className="w-4 h-4 text-gray-400" />
            <span>Configuración att2000</span>
          </a>
          <a href="/asistencia/relojes/diagnostico" className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Wifi className="w-4 h-4 text-gray-400" />
            <span>Diagnóstico de relojes</span>
          </a>
          <a href="/asistencia" className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4 text-gray-400" />
            <span>Dashboard asistencia</span>
          </a>
        </div>
      </Card>
    </div>
  )
}
