'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { AlertTriangle, CheckCircle, RefreshCw, Clock, Database, Wifi, WifiOff, Users, Download, Play, XCircle, Activity, Eye, EyeOff, PlusCircle, Trash2, RotateCcw, FileText, ChevronDown, ChevronUp, List, Search, ArrowRight } from 'lucide-react'

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
interface TimelineLog {
  id: number; timestamp: string; timestamp_local?: string
  type: string; source: string; device_name: string | null
  used_in_calculation?: boolean
  suggested_exclusion?: boolean
  requires_review?: boolean
}
interface TimelineSegment {
  segment_index: number; segment_type?: string
  in_at: string | null; in_at_local?: string
  out_at: string | null; out_at_local?: string
  gross_minutes?: number | null; worked_minutes?: number | null
  /** legacy column name */
  minutes?: number | null
  confidence: string; anomaly_code: string | null
}
interface TimelineAnomaly { id?: number; anomaly_type: string; severity: string; message: string | null; resolved?: boolean }
interface TimelineSummary {
  first_in: string | null; first_in_local?: string
  last_out: string | null; last_out_local?: string
  lunch_out: string | null; lunch_out_local?: string
  lunch_in: string | null; lunch_in_local?: string
  gross_minutes?: number
  worked_minutes: number; break_minutes: number; late_minutes: number; status: string
  calculation_status?: 'provisional' | 'approved' | 'adjusted'
  requires_review?: boolean
}
interface ManualAdjustment {
  id: number
  employee_id: number
  work_date: string
  original_log_id: number | null
  adjustment_type: string
  old_value: unknown
  new_value: unknown
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_by: number
  requested_by_name: string | null
  approved_by: number | null
  approved_by_name: string | null
  created_at: string
  approved_at: string | null
}
interface TimelineData {
  ok: boolean
  employee: { id: number; full_name: string; department: string; schedule_name: string | null; check_in: string | null }
  date: string
  raw_logs: TimelineLog[]
  approved_excluded_logs?: TimelineLog[]
  suggested_exclusions?: TimelineLog[]
  review_required_logs?: TimelineLog[]
  calculation_explanation?: string[]
  segments: TimelineSegment[]
  summary: TimelineSummary | null
  anomalies: TimelineAnomaly[]
  att2000_punches: Array<{ raw_checktime: string; CHECKTYPE: string }> | null
  policy?: { name: string; scope_type: string; auto_deduct_break: boolean; break_minutes: number } | null
}

const CALC_STATUS_COLOR: Record<string, string> = {
  provisional: 'bg-amber-50 text-amber-700 border-amber-200',
  adjusted:    'bg-blue-50 text-blue-700 border-blue-200',
  approved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
}
const CALC_STATUS_LABEL: Record<string, string> = {
  provisional: 'Provisional',
  adjusted:    'Ajustado',
  approved:    'Aprobado',
}

const ADJ_TYPE_LABEL: Record<string, string> = {
  add_punch:                 'Agregar marcación',
  exclude_from_calculation:  'Excluir del cálculo',
  include_in_calculation:    'Incluir en cálculo',
  change_type:               'Cambiar tipo (in/out)',
  change_time:               'Corregir hora',
  justify_missing_punch:     'Justificar falta de marcación',
}

// ─── CreateAdjustmentPanel ────────────────────────────────────────────────────
function CreateAdjustmentPanel({
  employeeId, date, logs, onCreated,
}: {
  employeeId: number; date: string; logs: TimelineLog[]; onCreated: () => void
}) {
  const [open, setOpen]   = useState(false)
  const [type, setType]   = useState('exclude_from_calculation')
  const [logId, setLogId] = useState('')
  const [reason, setReason] = useState('')
  const [newTs, setNewTs]   = useState('')
  const [newType, setNewType] = useState('in')
  const [saving, setSaving]  = useState(false)
  const [err, setErr]        = useState<string | null>(null)

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const body: Record<string, unknown> = {
        employee_id: employeeId, work_date: date, adjustment_type: type, reason,
      }
      if (['exclude_from_calculation','include_in_calculation','change_type','change_time'].includes(type)) {
        if (!logId) { setErr('Seleccione la marcación'); setSaving(false); return }
        body.original_log_id = +logId
        const log = logs.find(l => l.id === +logId)
        if (log) body.old_value = { timestamp: log.timestamp_local ?? log.timestamp, type: log.type }
      }
      if (type === 'add_punch') {
        if (!newTs) { setErr('Ingrese la hora de la marcación'); setSaving(false); return }
        body.new_value = { timestamp: `${date} ${newTs}:00`, type: newType }
      }
      if (type === 'change_time') {
        if (!newTs) { setErr('Ingrese la nueva hora'); setSaving(false); return }
        body.new_value = { timestamp: `${date} ${newTs}:00`, type: newType }
      }
      await api.post('/api/attendance/manual-adjustments', body)
      setOpen(false); setReason(''); setLogId(''); setNewTs('')
      onCreated()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (e as { message?: string })?.message ?? 'Error al crear ajuste'
      setErr(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
      >
        <span className="flex items-center gap-2"><PlusCircle className="w-3.5 h-3.5 text-emerald-600" />Solicitar ajuste</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tipo de ajuste</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500">
                {Object.entries(ADJ_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {['exclude_from_calculation','include_in_calculation','change_type','change_time','justify_missing_punch'].includes(type) && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Marcación afectada</label>
                <select value={logId} onChange={e => setLogId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">— seleccionar —</option>
                  {logs.map(l => (
                    <option key={l.id} value={l.id}>{fmtTime(localOrRaw(l.timestamp_local, l.timestamp))} ({l.type})</option>
                  ))}
                </select>
              </div>
            )}
            {['add_punch','change_time'].includes(type) && (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Nueva hora (HH:MM)</label>
                  <input type="time" value={newTs} onChange={e => setNewTs(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Tipo</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500">
                    <option value="in">Entrada (in)</option>
                    <option value="out">Salida (out)</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Motivo / justificación</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="Ej: Empleado olvidó marcar salida el día..."
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={submit} disabled={saving}
              className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando…' : 'Enviar solicitud'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AdjustmentsList ─────────────────────────────────────────────────────────
function AdjustmentsList({
  employeeId, date, onAction,
}: {
  employeeId: number; date: string; onAction: () => void
}) {
  const [items, setItems]   = useState<ManualAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [actErr, setActErr]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/attendance/manual-adjustments?employee_id=${employeeId}&date=${date}`)
      setItems(data.adjustments ?? [])
    } catch { /* ignorar si tabla no existe */ } finally {
      setLoading(false)
    }
  }, [employeeId, date])

  useEffect(() => { load() }, [load])

  const act = async (id: number, action: 'approve' | 'reject') => {
    setActErr(null)
    try {
      await api.put(`/api/attendance/manual-adjustments/${id}/${action}`)
      await load()
      onAction()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (e as { message?: string })?.message ?? `Error al ${action === 'approve' ? 'aprobar' : 'rechazar'}`
      setActErr(msg)
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Cargando ajustes…</p>
  if (!items.length) return <p className="text-xs text-slate-400">Sin ajustes solicitados para esta fecha.</p>

  return (
    <div className="space-y-2">
      {actErr && <p className="text-xs text-red-600">{actErr}</p>}
      {items.map(adj => (
        <div key={adj.id} className={`rounded-lg border text-xs px-3 py-2 ${
          adj.status === 'approved' ? 'bg-emerald-50 border-emerald-200'
          : adj.status === 'rejected' ? 'bg-red-50 border-red-200'
          : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">{ADJ_TYPE_LABEL[adj.adjustment_type] ?? adj.adjustment_type}</span>
                <span className={`px-1.5 py-0.5 rounded font-medium ${
                  adj.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                  : adj.status === 'rejected' ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
                }`}>{adj.status}</span>
              </div>
              {adj.reason && <p className="text-slate-500">{adj.reason}</p>}
              <p className="text-slate-400">
                Por: {adj.requested_by_name ?? `#${adj.requested_by}`}
                {adj.approved_by_name && ` · ${adj.status === 'approved' ? 'Aprobado' : 'Rechazado'} por: ${adj.approved_by_name}`}
              </p>
            </div>
            {adj.status === 'pending' && (
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => act(adj.id, 'approve')}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors">
                  <CheckCircle className="w-3 h-3" /> Aprobar
                </button>
                <button onClick={() => act(adj.id, 'reject')}
                  className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                  <XCircle className="w-3 h-3" /> Rechazar
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
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

/** Extrae HH:MM de un string 'YYYY-MM-DD HH:mm:ss' (campo *_local) o ISO. */
function fmtTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  // Normaliza: 'YYYY-MM-DD HH:mm:ss' o ISO con T
  const s = ts.replace('T', ' ').replace('Z', '')
  const time = s.slice(11, 16)
  return time || ts.slice(0, 16)
}

/** Devuelve la versión local si existe, si no intenta parsear el campo crudo. */
function localOrRaw(local: string | null | undefined, raw: string | null | undefined): string | null {
  return local ?? raw ?? null
}

// ─── ReviewQueuePanel ─────────────────────────────────────────────────────────
interface ReviewEmployee {
  employee_id: number; full_name: string; department: string
  calculation_status: string; requires_review: number
  worked_minutes: number | null; day_status: string
  pending_adjustments: number; anomaly_types: string | null
}

const ANOMALY_COLOR: Record<string, string> = {
  missing_out:      'bg-red-100 text-red-700',
  missing_in:       'bg-red-100 text-red-700',
  duplicate_nearby: 'bg-orange-100 text-orange-700',
  out_before_in:    'bg-orange-100 text-orange-700',
  short_shift:      'bg-amber-100 text-amber-700',
}

function ReviewQueuePanel({ date, onSelect }: { date: string; onSelect: (empId: number, empDate: string) => void }) {
  const [rows, setRows]       = useState<ReviewEmployee[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [filter, setFilter]   = useState('')

  const load = useCallback(async (d: string) => {
    setLoading(true); setErr(null)
    try {
      const { data } = await api.get(`/api/attendance/review-queue?date=${d}`)
      setRows(data.employees ?? [])
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (e as { message?: string })?.message ?? 'Error cargando cola'
      setErr(msg)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (date) load(date) }, [date, load])

  const filtered = filter
    ? rows.filter(r => r.full_name.toLowerCase().includes(filter.toLowerCase()) || r.department.toLowerCase().includes(filter.toLowerCase()))
    : rows

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filtrar por nombre o departamento…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button onClick={() => load(date)} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
        {rows.length > 0 && (
          <span className="text-xs text-slate-500">{filtered.length} empleado{filtered.length !== 1 ? 's' : ''} con revisión pendiente</span>
        )}
      </div>

      {err && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <XCircle className="w-3.5 h-3.5 shrink-0" />{err}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-6 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Sin empleados con revisión pendiente para esta fecha.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Empleado</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Departamento</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Estado</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Trabajado</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Anomalías</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Ajustes pend.</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => (
                <tr key={r.employee_id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => onSelect(r.employee_id, date)}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{r.full_name}</span>
                    <span className="ml-1.5 text-slate-400">#{r.employee_id}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.department}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${CALC_STATUS_COLOR[r.calculation_status] ?? 'bg-gray-100 text-gray-600 border-gray-200'} border`}>
                      {CALC_STATUS_LABEL[r.calculation_status] ?? r.calculation_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700">{r.worked_minutes ? minsToHM(r.worked_minutes) : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.anomaly_types ?? '').split(',').filter(Boolean).map(a => (
                        <span key={a} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ANOMALY_COLOR[a] ?? 'bg-gray-100 text-gray-600'}`}>{a}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.pending_adjustments > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">{r.pending_adjustments} pend.</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── EmployeeSearch ───────────────────────────────────────────────────────────
function EmployeeSearch({ value, onSelect }: { value: string; onSelect: (id: string, name: string) => void }) {
  const [q, setQ]             = useState('')
  const [results, setResults] = useState<Array<{ id: number; full_name: string; code: string }>>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (term: string) => {
    if (term.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const { data } = await api.get(`/api/employees?q=${encodeURIComponent(term)}&limit=10`)
      setResults(data.employees ?? data ?? [])
    } catch { setResults([]) } finally { setLoading(false) }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; setQ(v); setOpen(true)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(v), 300)
  }

  const pick = (emp: { id: number; full_name: string; code: string }) => {
    setQ(emp.full_name); setOpen(false)
    onSelect(String(emp.id), emp.full_name)
  }

  const currentDisplay = value ? (q || `ID ${value}`) : q

  return (
    <div className="relative">
      <label className="block text-xs text-gray-500 mb-1">Empleado</label>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={currentDisplay}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar por nombre o ID…"
          className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {loading && <RefreshCw className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {results.map(emp => (
            <button key={emp.id} onMouseDown={() => pick(emp)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0">
              <span className="font-medium text-slate-900">{emp.full_name}</span>
              <span className="text-slate-400 ml-auto">#{emp.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DayTimelinePanel({ defaultDate, defaultEmployeeId, externalEmpId, externalDate }: {
  defaultDate: string; defaultEmployeeId?: string
  externalEmpId?: string; externalDate?: string
}) {
  const [date, setDate]           = useState(externalDate ?? defaultDate)
  const [empId, setEmpId]         = useState(externalEmpId ?? defaultEmployeeId ?? '')
  const [empName, setEmpName]     = useState('')
  const [data, setData]           = useState<TimelineData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [adjKey, setAdjKey]       = useState(0)

  // Sync external props (set from queue panel)
  useEffect(() => {
    if (externalEmpId && externalEmpId !== empId) { setEmpId(externalEmpId); setEmpName('') }
  }, [externalEmpId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (externalDate && externalDate !== date) setDate(externalDate)
  }, [externalDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
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
  }, [date, empId])

  // Auto-load when external selection arrives
  useEffect(() => {
    if (externalEmpId && externalDate) load()
  }, [externalEmpId, externalDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadAll = useCallback(() => { setAdjKey(k => k + 1); load() }, [load])

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <h3 className="text-xs font-semibold text-slate-700">Línea de Tiempo de Jornada</h3>
      </div>
      <div className="p-4 space-y-4">
        {/* Controles */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <EmployeeSearch
            value={empId}
            onSelect={(id, name) => { setEmpId(id); setEmpName(name) }}
          />
          {empId && !empName && (
            <div className="flex flex-col justify-end">
              <label className="block text-xs text-gray-500 mb-1">ID manual</label>
              <input type="number" placeholder="ej: 11" value={empId} onChange={e => setEmpId(e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          )}
          <div className="flex items-end">
            <button onClick={() => load()} disabled={loading || !empId}
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
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex flex-wrap gap-4 items-center">
              <div>
                <p className="text-sm font-semibold text-slate-900">{data.employee.full_name}</p>
                <p className="text-xs text-slate-500">{data.employee.department}</p>
              </div>
              {data.employee.schedule_name && (
                <div className="text-xs text-slate-500">
                  <span className="font-medium">Horario:</span> {data.employee.schedule_name}
                  {data.employee.check_in && ` (entrada: ${data.employee.check_in.slice(0,5)})`}
                </div>
              )}
              {data.summary && (
                <div className="ml-auto flex items-center gap-4 divide-x divide-slate-200">
                  <div className="px-3 first:pl-0 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Trabajado</p>
                    <p className="text-sm font-bold text-emerald-700">{minsToHM(data.summary.worked_minutes)}</p>
                  </div>
                  <div className="px-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Almuerzo</p>
                    <p className="text-sm font-medium text-blue-700">{minsToHM(data.summary.break_minutes)}</p>
                  </div>
                  <div className="px-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Atraso</p>
                    <p className={`text-sm font-medium ${(data.summary.late_minutes ?? 0) > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{minsToHM(data.summary.late_minutes)}</p>
                  </div>
                  <div className="px-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Estado</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[data.summary.status] ?? 'bg-gray-100 text-gray-700'}`}>{data.summary.status}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Visual timeline bar */}
            {data.raw_logs.length > 0 && (() => {
              const DAY_START = 6 * 60  // 06:00
              const DAY_END   = 20 * 60 // 20:00
              const RANGE     = DAY_END - DAY_START
              const toMin = (ts: string | null | undefined) => {
                if (!ts) return null
                const t = fmtTime(ts)
                if (t === '—') return null
                const [h, m] = t.split(':').map(Number)
                return h * 60 + m
              }
              const pct = (min: number | null) => min === null ? null : `${Math.max(0, Math.min(100, ((min - DAY_START) / RANGE) * 100))}%`
              return (
                <div className="px-4 py-3 border border-slate-100 rounded-lg bg-slate-50">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">Línea de tiempo</p>
                  <div className="relative h-6 bg-slate-100 rounded overflow-hidden">
                    {/* Hour markers */}
                    {[8,10,12,14,16,18].map(h => (
                      <div key={h} className="absolute top-0 bottom-0 w-px bg-slate-200"
                           style={{ left: `${((h * 60 - DAY_START) / RANGE) * 100}%` }} />
                    ))}
                    {/* Work segments */}
                    {data.segments.map((seg, i) => {
                      const inLocal  = localOrRaw(seg.in_at_local, seg.in_at)
                      const outLocal = localOrRaw(seg.out_at_local, seg.out_at)
                      const inMin  = toMin(inLocal)
                      const outMin = toMin(outLocal)
                      if (inMin === null || outMin === null) return null
                      const mins = seg.gross_minutes ?? seg.minutes ?? 0
                      return (
                        <div key={i}
                          className={`absolute top-1 bottom-1 rounded ${seg.anomaly_code ? 'bg-red-400' : 'bg-emerald-500'}`}
                          style={{ left: pct(inMin)!, width: `${((outMin - inMin) / RANGE) * 100}%` }}
                          title={`Seg ${seg.segment_index ?? i+1}: ${fmtTime(inLocal)} → ${fmtTime(outLocal)} (${minsToHM(mins)})`}
                        />
                      )
                    })}
                    {/* Lunch gap */}
                    {data.summary && (() => {
                      const lOutLocal = localOrRaw(data.summary!.lunch_out_local, data.summary!.lunch_out)
                      const lInLocal  = localOrRaw(data.summary!.lunch_in_local,  data.summary!.lunch_in)
                      if (!lOutLocal || !lInLocal) return null
                      const lOut = toMin(lOutLocal)
                      const lIn  = toMin(lInLocal)
                      if (!lOut || !lIn) return null
                      return (
                        <div className="absolute top-1 bottom-1 bg-blue-300/60 rounded"
                             style={{ left: pct(lOut)!, width: `${((lIn - lOut) / RANGE) * 100}%` }}
                             title={`Almuerzo: ${fmtTime(lOutLocal)} → ${fmtTime(lInLocal)}`} />
                      )
                    })()}
                    {/* Hour labels */}
                    <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[9px] text-slate-400 pointer-events-none">
                      {[6,8,10,12,14,16,18,20].map(h => (
                        <span key={h} style={{ position: 'absolute', left: `${((h * 60 - DAY_START) / RANGE) * 100}%` }}>
                          {h}h
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6" />
                </div>
              )
            })()}

            {/* Cronología visual */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500">Marcaciones cronológicas</p>
                {data.summary?.calculation_status && (
                  <span className={`px-2 py-0.5 rounded border text-xs font-medium ${CALC_STATUS_COLOR[data.summary.calculation_status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                    {CALC_STATUS_LABEL[data.summary.calculation_status] ?? data.summary.calculation_status}
                    {data.summary.requires_review && ' · ⚠ revisión requerida'}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs ent-table">
                  <thead>
                    <tr>
                      <th className="text-left">#</th>
                      <th className="text-left">Hora</th>
                      <th className="text-left">Tipo</th>
                      <th className="text-left">Fuente</th>
                      <th className="text-left">Reloj</th>
                      <th className="text-left">Estado cálculo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.raw_logs.length === 0 ? (
                      <tr><td colSpan={6} className="py-3 text-slate-400">Sin marcaciones para esta fecha</td></tr>
                    ) : data.raw_logs.map((log, idx) => (
                      <tr key={log.id} className={log.suggested_exclusion ? 'opacity-60' : ''}>
                        <td className="text-slate-400">{idx + 1}</td>
                        <td className="font-mono font-medium text-slate-900">{fmtTime(localOrRaw(log.timestamp_local, log.timestamp))}</td>
                        <td>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${log.type === 'in' ? 'bg-green-100 text-green-700' : log.type === 'out' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                            {log.type === 'in' ? '↑ entrada' : log.type === 'out' ? '↓ salida' : log.type}
                          </span>
                        </td>
                        <td className="text-slate-500">{log.source}</td>
                        <td className="text-slate-400">{log.device_name ?? '—'}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {log.used_in_calculation === true && !log.suggested_exclusion && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium border border-emerald-200">
                                <Eye className="w-2.5 h-2.5" /> usado
                              </span>
                            )}
                            {log.suggested_exclusion && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium border border-slate-200">
                                <EyeOff className="w-2.5 h-2.5" /> posible duplicado
                              </span>
                            )}
                            {log.requires_review && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium border border-amber-200">
                                <AlertTriangle className="w-2.5 h-2.5" /> revisar
                              </span>
                            )}
                            {log.source === 'manual_adjustment' && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px] font-medium border border-violet-200">
                                <PlusCircle className="w-2.5 h-2.5" /> ajuste manual
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Segmentos de trabajo */}
            {data.segments.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Bloques de trabajo calculados</p>
                <div className="space-y-2">
                  {data.segments.map((seg, i) => {
                    const inLocal  = localOrRaw(seg.in_at_local, seg.in_at)
                    const outLocal = localOrRaw(seg.out_at_local, seg.out_at)
                    const mins = seg.gross_minutes ?? seg.minutes
                    const lunchOutLocal = localOrRaw(data.summary?.lunch_out_local, data.summary?.lunch_out)
                    const lunchInLocal  = localOrRaw(data.summary?.lunch_in_local, data.summary?.lunch_in)
                    return (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${seg.anomaly_code ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <span className="text-xs font-medium text-slate-500 w-6">{seg.segment_index ?? i + 1}</span>
                        <span className="font-mono text-slate-700">
                          {fmtTime(inLocal)} → {fmtTime(outLocal)}
                        </span>
                        {mins != null && (
                          <span className="font-medium text-emerald-700">{minsToHM(mins)}</span>
                        )}
                        {seg.anomaly_code && (
                          <span className="text-xs text-red-600 font-medium">{seg.anomaly_code}</span>
                        )}
                        {i === 0 && data.segments.length >= 2 && lunchOutLocal && (
                          <span className="ml-auto text-xs text-blue-600">
                            ☕ almuerzo {fmtTime(lunchOutLocal)} → {fmtTime(lunchInLocal)}
                            {(data.summary?.break_minutes ?? 0) > 0 && ` (${minsToHM(data.summary!.break_minutes)})`}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Policy display */}
                {data.policy && (
                  <div className="pt-2 border-t border-slate-100 mt-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5">Política aplicada</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span><span className="text-slate-400">Nombre:</span> {data.policy.name}</span>
                      <span><span className="text-slate-400">Ámbito:</span> {data.policy.scope_type}</span>
                      <span><span className="text-slate-400">Desc. almuerzo:</span> {data.policy.auto_deduct_break ? `Sí (${data.policy.break_minutes} min)` : 'No'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Comparación att2000 */}
            {data.att2000_punches && data.att2000_punches.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Marcaciones en att2000 (referencia)</p>
                <div className="flex flex-wrap gap-2">
                  {data.att2000_punches.map((p, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-100 rounded text-xs font-mono text-slate-700">
                      {p.raw_checktime?.slice(11, 16)} {p.CHECKTYPE ? `(${p.CHECKTYPE})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Explicación del cálculo */}
            {data.calculation_explanation && data.calculation_explanation.length > 0 && (
              <div className="border border-blue-100 rounded-lg bg-blue-50 px-4 py-3">
                <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Notas del cálculo
                </p>
                <ul className="space-y-1">
                  {data.calculation_explanation.map((note, i) => (
                    <li key={i} className="text-xs text-blue-700 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0 text-blue-400">•</span>{note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Anomalías */}
            {data.anomalies.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Anomalías detectadas</p>
                <div className="space-y-1">
                  {data.anomalies.map((a, i) => (
                    <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${a.resolved ? 'bg-slate-50 border-slate-200 opacity-60' : SEV_COLOR[a.severity] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {a.resolved
                        ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                        : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                      <span className="font-medium mr-1">{a.anomaly_type}</span>
                      {a.resolved && <span className="text-emerald-600 font-medium mr-1">[resuelta]</span>}
                      {a.message && <span className="opacity-80">{a.message}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ajustes manuales */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-700">Revisión y correcciones manuales</p>
              <CreateAdjustmentPanel
                employeeId={data.employee.id}
                date={date}
                logs={data.raw_logs}
                onCreated={reloadAll}
              />
              <AdjustmentsList
                key={adjKey}
                employeeId={data.employee.id}
                date={date}
                onAction={reloadAll}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
type Tab = 'queue' | 'jornada' | 'diagnostico'

export default function ConciliacionPage() {
  const today = new Date().toISOString().split('T')[0]
  const [tab, setTab]             = useState<Tab>('queue')
  const [date, setDate]           = useState(today)
  const [queueEmpId, setQueueEmpId] = useState<string>('')
  const [queueDate, setQueueDate]   = useState<string>('')
  const [data, setData]           = useState<DiagnosticData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

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

  useEffect(() => { if (tab === 'diagnostico') load(date) }, [date, tab, load])

  const handleQueueSelect = (empId: number, empDate: string) => {
    setQueueEmpId(String(empId))
    setQueueDate(empDate)
    setTab('jornada')
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'queue',      label: 'Cola de revisión', icon: <List className="w-3.5 h-3.5" /> },
    { id: 'jornada',    label: 'Investigar jornada', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'diagnostico',label: 'Diagnóstico técnico', icon: <Database className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Conciliación de Marcaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Revisión y corrección de jornadas · att2000 → logs → daily_summary</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date" value={date} max={today}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Cola de revisión ─── */}
      {tab === 'queue' && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <List className="w-4 h-4 text-slate-400" />
              Empleados con revisión pendiente
            </h2>
            <span className="text-xs text-slate-400">{date}</span>
          </div>
          <ReviewQueuePanel date={date} onSelect={handleQueueSelect} />
        </div>
      )}

      {/* ─── Tab: Investigar jornada ─── */}
      {tab === 'jornada' && (
        <DayTimelinePanel
          defaultDate={date}
          externalEmpId={queueEmpId || undefined}
          externalDate={queueDate || undefined}
        />
      )}

      {/* ─── Tab: Diagnóstico técnico ─── */}
      {tab === 'diagnostico' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => load(date)} disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando…' : 'Actualizar diagnóstico'}
            </button>
          </div>

          {/* Import/recalc panel */}
          <ImportPanel onDone={() => load(date)} />

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
      )}
    </div>
  )
}
