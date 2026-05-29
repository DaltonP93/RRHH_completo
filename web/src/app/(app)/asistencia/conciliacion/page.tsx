'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { AlertTriangle, CheckCircle, RefreshCw, Clock, Database, Wifi, WifiOff, Users, Download, Play, XCircle, Activity } from 'lucide-react'

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
      devices_env: number
      devices_db: number
      devices_detected: number
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
    <div className={`bg-white rounded-lg border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden ${className ?? ''}`}>
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-base font-bold text-slate-900">{value}</p>
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
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {running
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Procesando…</>
            : <><Play className="w-4 h-4" />{mode === 'import_recalc' ? 'Importar y recalcular' : 'Recalcular'}</>
          }
        </button>

        {result && (
          <div className={`rounded-lg p-3 text-xs ${result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
              <span className={`text-xs font-medium ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
                {result.ok ? 'Completado' : 'Error'}
              </span>
            </div>
            {result.error   && <p className="text-xs text-red-700">{result.error}</p>}
            {result.warning && <p className="text-xs text-amber-700">{result.warning}</p>}
            {result.message && <p className="text-xs text-green-700">{result.message}</p>}
            {result.source_total !== undefined && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
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

// ─── Day Timeline Panel ────────────────────────────────────────────────────────
interface TimelineLog { id: number; timestamp: string; type: string; source: string; device_name: string | null }
interface TimelineSegment { segment_index: number; in_at: string | null; out_at: string | null; minutes: number | null; confidence: string; anomaly_code: string | null }
interface TimelineAnomaly { anomaly_type: string; severity: string; message: string | null }
interface TimelineSummary { first_in: string | null; lunch_out: string | null; lunch_in: string | null; last_out: string | null; worked_minutes: number; break_minutes: number; late_minutes: number; status: string }
interface TimelineData {
  ok: boolean
  employee: { id: number; full_name: string; department: string; schedule_name: string | null; check_in: string | null }
  date: string
  raw_logs: TimelineLog[]
  segments: TimelineSegment[]
  summary: TimelineSummary | null
  anomalies: TimelineAnomaly[]
  att2000_punches: Array<{ raw_checktime: string; CHECKTYPE: string }> | null
}

const SEV_COLOR: Record<string, string> = {
  error:   'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info:    'bg-blue-100 text-blue-700 border-blue-200',
}

function minsToHM(mins: number | null): string {
  if (!mins || mins <= 0) return '0:00'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function fmtTime(ts: string | null): string {
  if (!ts) return '—'
  const s = ts.replace('T', ' ').replace('Z', '').slice(11, 16)
  return s || ts.slice(0, 16)
}

function DayTimelinePanel({ defaultDate, defaultEmployeeId }: { defaultDate: string; defaultEmployeeId?: string }) {
  const [date, setDate]           = useState(defaultDate)
  const [empId, setEmpId]         = useState(defaultEmployeeId ?? '')
  const [data, setData]           = useState<TimelineData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = async () => {
    if (!empId) return
    setLoading(true); setError(null); setData(null)
    try {
      const { data: resp } = await api.get(`/api/attendance/day-timeline?date=${date}&employee_id=${empId}`)
      setData(resp)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (e as { message?: string })?.message ?? 'Error de red'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="Línea de Tiempo de Jornada">
      <div className="space-y-4">
        {/* Controles */}
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ID Empleado</label>
            <input type="number" placeholder="ej: 11" value={empId} onChange={e => setEmpId(e.target.value)}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-end">
            <button onClick={load} disabled={loading || !empId}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <Activity className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando…' : 'Ver jornada'}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <XCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Encabezado empleado */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex flex-wrap gap-4 items-center">
              <div>
                <p className="font-semibold text-gray-900">{data.employee.full_name}</p>
                <p className="text-xs text-gray-500">{data.employee.department}</p>
              </div>
              {data.employee.schedule_name && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Horario:</span> {data.employee.schedule_name}
                  {data.employee.check_in && ` (entrada: ${data.employee.check_in.slice(0,5)})`}
                </div>
              )}
              {data.summary && (
                <div className="ml-auto flex gap-4 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Trabajado</p>
                    <p className="font-bold text-emerald-700">{minsToHM(data.summary.worked_minutes)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Almuerzo</p>
                    <p className="font-medium text-blue-700">{minsToHM(data.summary.break_minutes)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Atraso</p>
                    <p className={`font-medium ${(data.summary.late_minutes ?? 0) > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{minsToHM(data.summary.late_minutes)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Estado</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[data.summary.status] ?? 'bg-gray-100 text-gray-700'}`}>{data.summary.status}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Cronología visual */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Marcaciones cronológicas</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="text-left pb-2 pr-3">#</th>
                      <th className="text-left pb-2 pr-3">Hora</th>
                      <th className="text-left pb-2 pr-3">Tipo</th>
                      <th className="text-left pb-2 pr-3">Fuente</th>
                      <th className="text-left pb-2">Reloj</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.raw_logs.length === 0 ? (
                      <tr><td colSpan={5} className="py-3 text-gray-400">Sin marcaciones para esta fecha</td></tr>
                    ) : data.raw_logs.map((log, idx) => (
                      <tr key={log.id}>
                        <td className="py-1.5 pr-3 text-gray-400">{idx + 1}</td>
                        <td className="py-1.5 pr-3 font-mono font-medium text-gray-900">{fmtTime(log.timestamp)}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${log.type === 'in' ? 'bg-green-100 text-green-700' : log.type === 'out' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                            {log.type === 'in' ? '↑ entrada' : log.type === 'out' ? '↓ salida' : log.type}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-gray-500">{log.source}</td>
                        <td className="py-1.5 text-gray-400">{log.device_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Segmentos de trabajo */}
            {data.segments.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Bloques de trabajo calculados</p>
                <div className="space-y-2">
                  {data.segments.map((seg, i) => (
                    <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${seg.anomaly_code ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <span className="text-xs font-medium text-gray-500 w-6">{i + 1}</span>
                      <span className="font-mono text-gray-700">
                        {fmtTime(seg.in_at)} → {fmtTime(seg.out_at)}
                      </span>
                      {seg.minutes !== null && (
                        <span className="font-medium text-emerald-700">{minsToHM(seg.minutes)}</span>
                      )}
                      {seg.anomaly_code && (
                        <span className="text-xs text-red-600 font-medium">{seg.anomaly_code}</span>
                      )}
                      {i === 0 && data.segments.length >= 2 && data.summary?.lunch_out && (
                        <span className="ml-auto text-xs text-blue-600">
                          ☕ almuerzo {fmtTime(data.summary.lunch_out)} → {fmtTime(data.summary.lunch_in)}
                          {data.summary.break_minutes > 0 && ` (${minsToHM(data.summary.break_minutes)})`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comparación att2000 */}
            {data.att2000_punches && data.att2000_punches.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Marcaciones en att2000 (referencia)</p>
                <div className="flex flex-wrap gap-2">
                  {data.att2000_punches.map((p, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-700">
                      {p.raw_checktime?.slice(11, 16)} {p.CHECKTYPE ? `(${p.CHECKTYPE})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Anomalías */}
            {data.anomalies.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Anomalías detectadas</p>
                <div className="space-y-1">
                  {data.anomalies.map((a, i) => (
                    <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${SEV_COLOR[a.severity] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span className="font-medium mr-1">{a.anomaly_type}</span>
                      {a.message && <span className="opacity-80">{a.message}</span>}
                    </div>
                  ))}
                </div>
              </div>
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
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Conciliación de Marcaciones</h1>
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
                {data.sources.zkteco_bridge.devices_detected > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Wifi className="w-3 h-3" />{data.sources.zkteco_bridge.devices_detected} reloj(es)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Stat label="ENV (ZKTECO_DEVICES)" value={data.sources.zkteco_bridge.devices_env} />
                <Stat label="En BD (devices)"
                  value={
                    <span className={data.sources.zkteco_bridge.devices_db === 0 && data.sources.zkteco_bridge.devices_env > 0 ? 'text-amber-600' : ''}>
                      {data.sources.zkteco_bridge.devices_db}
                    </span>
                  }
                  sub={data.sources.zkteco_bridge.devices_db === 0 && data.sources.zkteco_bridge.devices_env > 0 ? 'Ejecutar POST /api/sync/devices' : undefined}
                />
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

      {/* Línea de tiempo de jornada */}
      <DayTimelinePanel defaultDate={date} />

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
