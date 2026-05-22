'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Users, Clock, DollarSign, CreditCard, FolderOpen, Star, Shield,
  BarChart2, Settings, Lock, Activity, AlertCircle, Loader2,
  Bell, Folder, ExternalLink, X, CheckCircle, ChevronRight,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { getViewAs } from '@/lib/viewAs'

// ─── Interfaces ────────────────────────────────────────────────────────────

interface ModuleDef {
  code: string
  name: string
  desc: string
  icon: React.ElementType
  route: string
  /** Tailwind gradient classes, e.g. "from-blue-500 to-blue-700" */
  gradient: string
  perm: string
}

interface ModuleCatalogEntry {
  code: string
  status?: 'available' | 'in_progress' | 'pending_migration' | 'error' | 'disabled'
  badge_count?: number
}

interface PorHacerItem {
  id: number | string
  title: string
  module: string
  date: string
  type: 'approval' | 'notification'
}

interface ActivityItem {
  id: number | string
  text: string
  sub: string
  ts: string
}

interface StatsState {
  totalEmployees: string
  marcacionesHoy: string
  pendientes: string
}

// ─── Module catalog ────────────────────────────────────────────────────────

const MODULES: ModuleDef[] = [
  { code: 'personas',      name: 'Gestión de Personas',    desc: 'Empleados, contratos, cargos, legajos y datos laborales.',                           icon: Users,       route: '/empleados',       gradient: 'from-blue-500 to-blue-700',    perm: 'people.view' },
  { code: 'asistencia',    name: 'Asistencia y Relojes',   desc: 'Marcaciones, horarios, turnos, ZKTeco, app móvil y tiempo real.',                     icon: Clock,       route: '/asistencia',      gradient: 'from-emerald-500 to-emerald-700', perm: 'attendance.view' },
  { code: 'nomina',        name: 'Nómina y Liquidaciones', desc: 'Conceptos salariales, liquidaciones, IPS, aguinaldo, vacaciones y preaviso.',         icon: DollarSign,  route: '/nomina',          gradient: 'from-violet-500 to-violet-700', perm: 'payroll.view' },
  { code: 'pagos',         name: 'Pagos y Bancos',         desc: 'Lotes de pago, archivos bancarios, cuentas y validación de pagos.',                   icon: CreditCard,  route: '/bancos',          gradient: 'from-orange-500 to-orange-700', perm: 'payments.view' },
  { code: 'documentos',    name: 'Documentos',             desc: 'Plantillas, expedientes, firma electrónica y auditoría documental.',                  icon: FolderOpen,  route: '/documentos',      gradient: 'from-amber-500 to-amber-700',  perm: 'documents.view' },
  { code: 'competencias',  name: 'Competencias',           desc: 'Evaluaciones de desempeño, planes de desarrollo y 360°.',                            icon: Star,        route: '/competencias',    gradient: 'from-pink-500 to-pink-700',    perm: 'competencies.view' },
  { code: 'cumplimiento',  name: 'Cumplimiento Legal',     desc: 'MTESS, IPS, exportaciones y reportes regulatorios.',                                  icon: Shield,      route: '/cumplimiento',    gradient: 'from-red-500 to-red-700',      perm: 'compliance.view' },
  { code: 'reportes',      name: 'Reportes y Analítica',   desc: 'Informes operativos, dashboards ejecutivos y análisis avanzado.',                     icon: BarChart2,   route: '/reportes',        gradient: 'from-cyan-500 to-cyan-700',    perm: 'reports.view' },
  { code: 'configuracion', name: 'Configuración',          desc: 'Parámetros del sistema, integraciones, notificaciones y relojes.',                    icon: Settings,    route: '/configuracion',   gradient: 'from-slate-500 to-slate-700',  perm: 'settings.view' },
  { code: 'seguridad',     name: 'Seguridad y Permisos',   desc: 'Usuarios, roles, permisos granulares y alcances multiempresa.',                       icon: Lock,        route: '/seguridad/roles', gradient: 'from-indigo-500 to-indigo-700', perm: 'security.view' },
  { code: 'auditoria',     name: 'Auditoría',              desc: 'Registro de eventos, cambios y accesos para trazabilidad.',                           icon: Activity,    route: '/auditoria',       gradient: 'from-gray-500 to-gray-700',    perm: 'audit.view' },
]

// Role → allowed module codes for "Ver Como" preview
const ROLE_MODULES: Record<string, string[]> = {
  admin:       ['personas', 'asistencia', 'nomina', 'pagos', 'documentos', 'competencias', 'cumplimiento', 'reportes', 'configuracion', 'seguridad', 'auditoria'],
  gth:         ['personas', 'asistencia', 'nomina', 'documentos', 'competencias', 'cumplimiento', 'reportes'],
  hr:          ['personas', 'asistencia', 'documentos', 'reportes'],
  gestor:      ['personas', 'asistencia', 'reportes'],
  supervisor:  ['asistencia', 'reportes'],
  coordinator: ['asistencia'],
  manager:     ['asistencia', 'personas'],
}

// ─── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'available') return null
  const config: Record<string, { label: string; cls: string }> = {
    in_progress:       { label: 'En configuración', cls: 'bg-yellow-100 text-yellow-700' },
    pending_migration: { label: 'Pendiente',         cls: 'bg-orange-100 text-orange-700' },
    error:             { label: 'Con errores',       cls: 'bg-red-100 text-red-700' },
    disabled:          { label: 'Deshabilitado',     cls: 'bg-gray-100 text-gray-500' },
  }
  const c = config[status]
  if (!c) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      {status === 'error' && <AlertCircle size={10} />}
      {c.label}
    </span>
  )
}

// ─── Canvas-style Module Card ───────────────────────────────────────────────

function ModuleCard({
  mod,
  disabled,
  status,
  badgeCount,
}: {
  mod: ModuleDef
  disabled: boolean
  status: ModuleCatalogEntry['status']
  badgeCount?: number
}) {
  const Icon = mod.icon
  return (
    <div
      className={`group relative bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all
        ${disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer shadow-sm'
        }`}
    >
      {/* Gradient header */}
      <div className={`relative h-36 bg-gradient-to-br ${mod.gradient} flex flex-col justify-between p-4`}>
        {/* Large centered icon */}
        <div className="flex-1 flex items-center justify-center">
          <Icon className="text-white/90" size={40} />
        </div>
        {/* White title at bottom-left */}
        <p className="text-white font-bold text-sm leading-tight drop-shadow-sm">
          {mod.name}
        </p>
        {/* Badge overlay */}
        {badgeCount != null && badgeCount > 0 && (
          <span className="absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-white/30 text-white text-xs font-bold flex items-center justify-center backdrop-blur-sm">
            {badgeCount}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 pb-3">
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{mod.desc}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold uppercase tracking-wide">
            Módulo activo
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Footer quick-action row */}
      <div className="px-4 pb-3 border-t border-slate-100 pt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={e => e.preventDefault()}
          className="relative flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
          title="Notificaciones"
        >
          <Bell size={15} />
          {badgeCount != null && badgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {badgeCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={e => e.preventDefault()}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Documentos"
        >
          <Folder size={15} />
        </button>
        <button
          type="button"
          onClick={e => e.preventDefault()}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Ir al módulo"
        >
          <ExternalLink size={15} />
        </button>
        <div className="flex-1" />
        <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
      </div>
    </div>
  )
}

// ─── Stats KPI card ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="text-white" size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── Por hacer panel ────────────────────────────────────────────────────────

function PorHacerPanel({ items, dismissed, onDismiss }: {
  items: PorHacerItem[]
  dismissed: Set<string | number>
  onDismiss: (id: string | number) => void
}) {
  const visible = items.filter(i => !dismissed.has(i.id))
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-slate-800 text-sm">Por hacer</h2>
        {visible.length > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center">
            {visible.length}
          </span>
        )}
      </div>
      {visible.length === 0 ? (
        <div className="p-6 flex flex-col items-center text-center gap-2">
          <CheckCircle size={28} className="text-emerald-400" />
          <p className="text-sm font-medium text-slate-700">¡Todo al día!</p>
          <p className="text-xs text-slate-400">No tienes tareas pendientes.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {visible.map(item => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
              {/* colored dot */}
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${item.type === 'approval' ? 'bg-orange-400' : 'bg-blue-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 font-medium leading-tight truncate">{item.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.module} · {item.date}</p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                className="text-slate-300 hover:text-slate-500 transition-colors mt-0.5 flex-shrink-0"
                title="Descartar"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Actividad reciente panel ───────────────────────────────────────────────

function ActividadPanel({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <h2 className="font-bold text-slate-800 text-sm">Actividad reciente</h2>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-xs text-slate-400 text-center">Sin actividad reciente.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {items.map(item => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 leading-tight line-clamp-1">{item.text}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.sub} · {item.ts}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function PortalPage() {
  const user = useCurrentUser()
  const viewAs = typeof window !== 'undefined' ? getViewAs() : null

  const [catalogMap, setCatalogMap]       = useState<Record<string, ModuleCatalogEntry>>({})
  const [loading, setLoading]             = useState(true)
  const [porHacer, setPorHacer]           = useState<PorHacerItem[]>([])
  const [actividad, setActividad]         = useState<ActivityItem[]>([])
  const [dismissed, setDismissed]         = useState<Set<string | number>>(new Set())
  const [stats, setStats]                 = useState<StatsState>({ totalEmployees: '--', marcacionesHoy: '--', pendientes: '--' })

  // Date formatted in Spanish
  const fechaHoy = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })

  // Load module permissions
  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await api.get('/api/me/module-permissions-rbac')
        const data = res.data
        const map: Record<string, ModuleCatalogEntry> = {}

        if (Array.isArray(data?.module_catalog)) {
          for (const entry of data.module_catalog as ModuleCatalogEntry[]) {
            map[entry.code] = entry
          }
        }
        if (data?.modules && typeof data.modules === 'object') {
          for (const [code, val] of Object.entries(data.modules as Record<string, Record<string, unknown>>)) {
            if (!map[code]) map[code] = { code }
            if (val?.status) map[code].status = val.status as ModuleCatalogEntry['status']
            if (val?.badge_count != null) map[code].badge_count = val.badge_count as number
          }
        }
        setCatalogMap(map)
      } catch {
        const map: Record<string, ModuleCatalogEntry> = {}
        for (const m of MODULES) map[m.code] = { code: m.code, status: 'available' }
        setCatalogMap(map)
      } finally {
        setLoading(false)
      }
    }
    loadPermissions()
  }, [])

  // Load "Por hacer" — approvals + notifications
  useEffect(() => {
    async function loadPorHacer() {
      const items: PorHacerItem[] = []

      try {
        const res = await api.get('/api/approvals?status=pending&limit=5')
        const approvals = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
        for (const a of approvals as Record<string, unknown>[]) {
          items.push({
            id: `approval-${a.id ?? Math.random()}`,
            title: (a.title ?? a.description ?? 'Aprobación pendiente') as string,
            module: (a.module ?? 'Permisos') as string,
            date: (a.created_at ?? a.date ?? '') as string,
            type: 'approval',
          })
        }
      } catch { /* graceful fallback */ }

      try {
        const res = await api.get('/api/notifications?unread=true&limit=5')
        const notifs = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
        for (const n of notifs as Record<string, unknown>[]) {
          items.push({
            id: `notif-${n.id ?? Math.random()}`,
            title: (n.title ?? n.message ?? 'Notificación') as string,
            module: (n.module ?? 'Sistema') as string,
            date: (n.created_at ?? n.date ?? '') as string,
            type: 'notification',
          })
        }
      } catch { /* graceful fallback */ }

      setPorHacer(items)
    }
    loadPorHacer()
  }, [])

  // Load stats
  useEffect(() => {
    async function loadStats() {
      let totalEmployees = '--'
      let marcacionesHoy = '--'
      let pendientes = '--'

      try {
        const res = await api.get('/api/employees?limit=1')
        const total = res.data?.total ?? res.data?.count
        if (total != null) totalEmployees = String(total)
      } catch { /* fallback */ }

      try {
        const res = await api.get('/api/attendance/live')
        const count = res.data?.today ?? res.data?.count ?? res.data?.total
        if (count != null) marcacionesHoy = String(count)
      } catch { /* fallback */ }

      try {
        const res = await api.get('/api/approvals?status=pending&limit=1')
        const total = res.data?.total ?? res.data?.count
        if (total != null) pendientes = String(total)
      } catch { /* fallback */ }

      setStats({ totalEmployees, marcacionesHoy, pendientes })
    }
    loadStats()
  }, [])

  function getStatus(code: string): ModuleCatalogEntry['status'] {
    return catalogMap[code]?.status ?? 'available'
  }

  function isDisabled(code: string) {
    const s = getStatus(code)
    return s === 'disabled' || s === 'pending_migration' || s === 'error'
  }

  const displayName = user?.fullName || user?.username || 'Usuario'

  const visibleModules = viewAs && user?.role === 'super_admin'
    ? MODULES.filter(m => (ROLE_MODULES[viewAs.role] ?? []).includes(m.code))
    : MODULES

  return (
    <div className="min-h-screen bg-slate-50 p-6">

      {/* ── Greeting header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Bienvenido, {displayName}
        </h1>
        <p className="text-slate-400 text-sm mt-0.5 capitalize">
          RRHH Completo &nbsp;·&nbsp; {fechaHoy}
        </p>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total empleados"   value={stats.totalEmployees} icon={Users}    color="bg-blue-500" />
        <StatCard label="Marcaciones hoy"   value={stats.marcacionesHoy} icon={Clock}    color="bg-emerald-500" />
        <StatCard label="Aprobaciones pend." value={stats.pendientes}    icon={Bell}     color="bg-orange-500" />
      </div>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

        {/* Left — Module cards */}
        <div>
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-slate-400" size={32} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {visibleModules.map(mod => {
                const disabled   = isDisabled(mod.code)
                const status     = getStatus(mod.code)
                const badgeCount = catalogMap[mod.code]?.badge_count

                const card = (
                  <ModuleCard
                    mod={mod}
                    disabled={disabled}
                    status={status}
                    badgeCount={badgeCount}
                  />
                )

                return disabled ? (
                  <div key={mod.code}>{card}</div>
                ) : (
                  <Link key={mod.code} href={mod.route} className="block">
                    {card}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Right — Por hacer + Actividad */}
        <div className="flex flex-col gap-5">
          <PorHacerPanel
            items={porHacer}
            dismissed={dismissed}
            onDismiss={id => setDismissed(prev => { const next = new Set(prev); next.add(id); return next; })}
          />
          <ActividadPanel items={actividad} />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-5 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        <Activity size={12} />
        <span>{MODULES.length} módulos disponibles</span>
      </div>
    </div>
  )
}
