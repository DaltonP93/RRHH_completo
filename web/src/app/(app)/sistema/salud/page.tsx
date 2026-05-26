'use client'
import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, XCircle, RefreshCw, Server, Database, Network, Cpu, HardDrive, Clock, Layers, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import BackButton from '@/components/BackButton'

// ─── Tipos ────────────────────────────────────────────────────
interface Check { ok: boolean; latency_ms?: number; error?: string; status?: number; [key: string]: any }
interface Detailed {
  status: string; timestamp: string; uptime_sec: number; version: string; node: string; host: string
  checks: { mysql: Check; redis: Check; att2000: Check; bridge: Check }
  memory: { rss_mb: number; heap_used_mb: number; heap_total_mb: number }
  loadavg: number[]
}
interface FullHealth {
  status: string; environment: string; timestamp: string; timezone: string | null
  checks: Record<string, Check>
  disk_gb: { total: number; free: number; used_pct: number } | null
}
interface ZKDiag {
  bridge: { status: string; devices: number }
  db_devices: { id: number; name: string; ip: string }[]
  env_devices: { id: string; name: string; ip: string }[]
  mismatch: boolean
  auto_poll: boolean
}

const CHECK_ICONS: Record<string, any> = {
  mysql:      Database,
  redis:      Network,
  att2000:    Server,
  bridge:     Cpu,
  storage:    HardDrive,
  analytics:  Activity,
  timezone:   Clock,
  migrations: Layers,
  disk:       HardDrive,
}
const CHECK_LABELS: Record<string, string> = {
  mysql:      'MySQL (asistencia)',
  redis:      'Redis',
  att2000:    'att2000 (SQL Server)',
  bridge:     'Bridge ZKTeco',
  storage:    'Almacenamiento',
  analytics:  'Analytics (Python)',
  timezone:   'Zona horaria',
  migrations: 'Migraciones',
  disk:       'Disco',
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400); s %= 86400
  const h = Math.floor(s / 3600);  s %= 3600
  const m = Math.floor(s / 60)
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '<1m'
}

function CheckCard({ name, check, zkDiag }: { name: string; check: Check; zkDiag?: ZKDiag | null }) {
  const Icon = CHECK_ICONS[name] || Server
  const label = CHECK_LABELS[name] || name

  // Para el check de bridge: si /api/zkteco/diagnostics confirma que los relojes
  // están disponibles, el estado real es OK aunque el health endpoint diga FAIL
  // (esto sucede cuando bridge responde por ENV pero no por container DNS interno).
  let effectiveOk = check.ok
  let zkWarnings: string[] = []

  if (name === 'bridge' && zkDiag) {
    const totalDevices = (zkDiag.db_devices?.length || 0) + (zkDiag.env_devices?.length || 0)
    const bridgeOk = zkDiag.bridge?.status === 'ok' || zkDiag.bridge?.devices > 0 || totalDevices > 0
    if (bridgeOk) effectiveOk = true
    if (zkDiag.db_devices?.length === 0) zkWarnings.push('Relojes solo por ENV (no en BD)')
    if (zkDiag.mismatch)                 zkWarnings.push('Mismatch: relojes ENV ≠ BD')
    if (!zkDiag.auto_poll)               zkWarnings.push('Auto-poll desactivado')
  }

  return (
    <div className={`bg-white rounded-2xl border shadow p-4 ${effectiveOk ? 'border-slate-100' : 'border-red-200'}`}>
      <div className="flex items-center gap-3">
        <Icon className={effectiveOk ? 'text-slate-400' : 'text-red-400'} size={20} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 text-sm">{label}</div>
          <div className="text-xs text-slate-500 truncate">
            {check.latency_ms != null && `${check.latency_ms}ms`}
            {check.tz && ` ${check.tz}`}
            {check.table_count != null && ` ${check.table_count} tablas`}
            {check.path && ` ${check.path}`}
            {name === 'bridge' && zkDiag && (
              ` ${(zkDiag.db_devices?.length || 0) + (zkDiag.env_devices?.length || 0)} relojes detectados`
            )}
          </div>
        </div>
        {effectiveOk
          ? <span className="flex-shrink-0 px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-xs font-medium">OK</span>
          : <span className="flex-shrink-0 px-2 py-1 rounded bg-red-100 text-red-800 text-xs font-medium">FAIL</span>}
      </div>
      {!check.ok && check.error && effectiveOk && (
        <div className="mt-2 text-xs text-amber-700 break-all bg-amber-50 rounded px-2 py-1">
          Nota: {check.error}
        </div>
      )}
      {!check.ok && check.error && !effectiveOk && (
        <div className="mt-2 text-xs text-red-700 break-all">{check.error}</div>
      )}
      {zkWarnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {zkWarnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
              <AlertTriangle size={11} className="flex-shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HealthPage() {
  const [detailed, setDetailed]   = useState<Detailed | null>(null)
  const [full, setFull]           = useState<FullHealth | null>(null)
  const [zkDiag, setZkDiag]       = useState<ZKDiag | null>(null)
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [det, ful, zk] = await Promise.allSettled([
        api.get('/api/health/detailed'),
        api.get('/api/health/full'),
        api.get('/api/zkteco/diagnostics'),
      ])
      if (det.status === 'fulfilled') setDetailed(det.value.data)
      else if ((det as any).reason?.response?.data) setDetailed((det as any).reason.response.data)
      if (ful.status === 'fulfilled') setFull(ful.value.data)
      else if ((ful as any).reason?.response?.data) setFull((ful as any).reason.response.data)
      if (zk.status === 'fulfilled') setZkDiag(zk.value.data)
      if (det.status === 'rejected' && ful.status === 'rejected')
        setErr('No se pudo contactar con la API')
    } catch (e: any) {
      setErr(e?.message || 'Error desconocido')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  const overallStatus = detailed?.status || full?.status || 'unknown'

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <BackButton href="/sistema" label="Sistema" />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Activity className="text-white" size={22} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Salud del sistema</h1>
          <p className="text-sm text-slate-500">Estado de dependencias y métricas del proceso API</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm text-slate-700 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {err && <div className="rounded-xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">{err}</div>}

      {/* Banner status */}
      {(detailed || full) && (
        <div className={`rounded-2xl p-4 border ${overallStatus === 'ok'
          ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-3">
            {overallStatus === 'ok'
              ? <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={22} />
              : <XCircle className="text-amber-600 flex-shrink-0" size={22} />}
            <div className="flex-1">
              <div className="font-semibold">
                Sistema {overallStatus === 'ok' ? 'operativo' : 'degradado'}
              </div>
              {detailed && (
                <div className="text-xs text-slate-600">
                  uptime {fmtUptime(detailed.uptime_sec)} · {detailed.host} · node {detailed.node} · v{detailed.version}
                </div>
              )}
              {full?.environment && (
                <div className="text-xs text-slate-500 mt-0.5">entorno: {full.environment}</div>
              )}
            </div>
            <div className="text-xs text-slate-500 text-right">
              {(detailed?.timestamp || full?.timestamp) && new Date(detailed?.timestamp || full?.timestamp || '').toLocaleString('es-PY')}
            </div>
          </div>
        </div>
      )}

      {/* Checks de /health/detailed (con latencia) */}
      {detailed && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase mb-3">Dependencias principales</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {(Object.entries(detailed.checks) as [string, Check][]).map(([k, c]) => (
              <CheckCard key={k} name={k} check={c} zkDiag={k === 'bridge' ? zkDiag : null} />
            ))}
          </div>
        </section>
      )}

      {/* Checks adicionales de /health/full */}
      {full && (() => {
        const extra = Object.entries(full.checks).filter(([k]) =>
          !detailed?.checks || !(k in detailed.checks)
        )
        if (!extra.length) return null
        return (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase mb-3">Subsistemas adicionales</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {extra.map(([k, c]) => <CheckCard key={k} name={k} check={c} zkDiag={k === 'bridge' ? zkDiag : null} />)}
            </div>
          </section>
        )
      })()}

      {/* Disco */}
      {full?.disk_gb && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow p-4">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={16} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Disco</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${full.disk_gb.used_pct > 85 ? 'bg-red-500' : full.disk_gb.used_pct > 70 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${full.disk_gb.used_pct}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-slate-700 flex-shrink-0">
              {full.disk_gb.used_pct}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>Libre: {full.disk_gb.free} GB</span>
            <span>Total: {full.disk_gb.total} GB</span>
          </div>
        </div>
      )}

      {/* Memoria y load avg */}
      {detailed && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow p-4 grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500 uppercase mb-1">RSS</div>
            <div className="text-2xl font-bold text-slate-900">{detailed.memory.rss_mb} MB</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase mb-1">Heap usado / total</div>
            <div className="text-2xl font-bold text-slate-900">
              {detailed.memory.heap_used_mb} / {detailed.memory.heap_total_mb} MB
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase mb-1">Load avg (1/5/15m)</div>
            <div className="text-2xl font-bold text-slate-900">
              {detailed.loadavg.map(n => n.toFixed(2)).join(' · ')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

