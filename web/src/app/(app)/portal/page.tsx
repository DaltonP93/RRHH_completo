'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Users, Clock, DollarSign, CreditCard, FolderOpen, Star, Shield,
  BarChart2, Settings, Lock, Activity, AlertCircle, Loader2,
  Bell, X, CheckCircle, ChevronRight, AlertTriangle, Radio,
  Calendar, FileText, TrendingUp,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { getViewAs } from '@/lib/viewAs'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ModuleDef {
  code: string
  name: string
  shortName: string
  desc: string
  icon: React.ElementType
  route: string
  accentColor: string
  bgColor: string
  quickLinks: { label: string; href: string }[]
}

interface ModuleCatalogEntry {
  code: string
  status?: 'available' | 'in_progress' | 'pending_migration' | 'error' | 'disabled'
  badge_count?: number
}

interface PendingItem {
  id: number | string
  title: string
  module: string
  date: string
  type: 'approval' | 'alert' | 'task'
}

interface StatsState {
  totalEmployees: string
  marcacionesHoy: string
  pendientes: string
  incidencias: string
}

// ─── Module catalog ──────────────────────────────────────────────────────────

const MODULES: ModuleDef[] = [
  {
    code: 'personas',
    name: 'Gestión de Personas',
    shortName: 'Personas',
    desc: 'Empleados, contratos, legajos y datos laborales',
    icon: Users,
    route: '/empleados',
    accentColor: 'text-blue-700',
    bgColor: 'bg-blue-600',
    quickLinks: [
      { label: 'Empleados', href: '/empleados' },
      { label: 'Legajos', href: '/personas/legajos' },
      { label: 'Contratos', href: '/personas/contratos' },
    ],
  },
  {
    code: 'asistencia',
    name: 'Asistencia y Relojes',
    shortName: 'Asistencia',
    desc: 'Marcaciones, horarios, turnos y relojes ZKTeco',
    icon: Clock,
    route: '/asistencia',
    accentColor: 'text-emerald-700',
    bgColor: 'bg-emerald-600',
    quickLinks: [
      { label: 'Marcaciones', href: '/asistencia' },
      { label: 'Tiempo Real', href: '/asistencia/tiempo-real' },
      { label: 'Permisos', href: '/permisos' },
    ],
  },
  {
    code: 'nomina',
    name: 'Nómina y Liquidaciones',
    shortName: 'Nómina',
    desc: 'Conceptos, liquidaciones, IPS, aguinaldo y vacaciones',
    icon: DollarSign,
    route: '/nomina',
    accentColor: 'text-violet-700',
    bgColor: 'bg-violet-600',
    quickLinks: [
      { label: 'Liquidaciones', href: '/nomina/liquidaciones' },
      { label: 'Conceptos', href: '/nomina/conceptos' },
      { label: 'Aguinaldo', href: '/nomina/aguinaldo' },
    ],
  },
  {
    code: 'pagos',
    name: 'Pagos y Bancos',
    shortName: 'Pagos',
    desc: 'Lotes de pago, cuentas y archivos bancarios',
    icon: CreditCard,
    route: '/bancos',
    accentColor: 'text-orange-700',
    bgColor: 'bg-orange-600',
    quickLinks: [
      { label: 'Lotes', href: '/bancos/lotes' },
      { label: 'Cuentas', href: '/bancos/cuentas-empleados' },
      { label: 'Historial', href: '/bancos/pagos' },
    ],
  },
  {
    code: 'documentos',
    name: 'Documentos',
    shortName: 'Documentos',
    desc: 'Plantillas, expedientes y firma electrónica',
    icon: FolderOpen,
    route: '/documentos',
    accentColor: 'text-amber-700',
    bgColor: 'bg-amber-600',
    quickLinks: [
      { label: 'Expedientes', href: '/documentos' },
      { label: 'Plantillas', href: '/documentos' },
      { label: 'Constancias', href: '/documentos' },
    ],
  },
  {
    code: 'competencias',
    name: 'Competencias',
    shortName: 'Competencias',
    desc: 'Evaluaciones de desempeño y planes de desarrollo',
    icon: Star,
    route: '/competencias',
    accentColor: 'text-pink-700',
    bgColor: 'bg-pink-600',
    quickLinks: [
      { label: 'Evaluaciones', href: '/competencias' },
      { label: 'Planes', href: '/competencias/planes' },
      { label: '360°', href: '/evaluaciones' },
    ],
  },
  {
    code: 'cumplimiento',
    name: 'Cumplimiento Legal',
    shortName: 'Cumplimiento',
    desc: 'MTESS/REOP, IPS/REI y reportes regulatorios',
    icon: Shield,
    route: '/cumplimiento',
    accentColor: 'text-red-700',
    bgColor: 'bg-red-600',
    quickLinks: [
      { label: 'MTESS/REOP', href: '/cumplimiento/mtess' },
      { label: 'IPS/REI', href: '/cumplimiento/ips' },
      { label: 'Planillas', href: '/cumplimiento' },
    ],
  },
  {
    code: 'reportes',
    name: 'Reportes y Analítica',
    shortName: 'Reportes',
    desc: 'Informes operativos y dashboards ejecutivos',
    icon: BarChart2,
    route: '/reportes',
    accentColor: 'text-cyan-700',
    bgColor: 'bg-cyan-600',
    quickLinks: [
      { label: 'Operativos', href: '/reportes' },
      { label: 'Personalizado', href: '/reportes/personalizado' },
      { label: 'Ejecutivo', href: '/ejecutivo' },
    ],
  },
  {
    code: 'seguridad',
    name: 'Seguridad y Permisos',
    shortName: 'Seguridad',
    desc: 'Usuarios, roles y permisos granulares',
    icon: Lock,
    route: '/seguridad/roles',
    accentColor: 'text-indigo-700',
    bgColor: 'bg-indigo-600',
    quickLinks: [
      { label: 'Usuarios', href: '/usuarios' },
      { label: 'Roles', href: '/seguridad/roles' },
      { label: 'Sesiones', href: '/seguridad/sesiones' },
    ],
  },
  {
    code: 'configuracion',
    name: 'Configuración',
    shortName: 'Config.',
    desc: 'Parámetros del sistema e integraciones',
    icon: Settings,
    route: '/configuracion',
    accentColor: 'text-slate-700',
    bgColor: 'bg-slate-600',
    quickLinks: [
      { label: 'General', href: '/configuracion' },
      { label: 'Notificaciones', href: '/notificaciones-config' },
      { label: 'Backups', href: '/sistema/backups' },
    ],
  },
  {
    code: 'auditoria',
    name: 'Auditoría',
    shortName: 'Auditoría',
    desc: 'Registro de eventos, cambios y accesos',
    icon: Activity,
    route: '/auditoria',
    accentColor: 'text-gray-700',
    bgColor: 'bg-gray-600',
    quickLinks: [
      { label: 'Eventos', href: '/auditoria' },
      { label: 'Accesos', href: '/auditoria' },
    ],
  },
]

const ROLE_MODULES: Record<string, string[]> = {
  admin:       MODULES.map(m => m.code),
  gth:         ['personas', 'asistencia', 'nomina', 'documentos', 'competencias', 'cumplimiento', 'reportes'],
  hr:          ['personas', 'asistencia', 'documentos', 'reportes'],
  gestor:      ['personas', 'asistencia', 'reportes'],
  supervisor:  ['asistencia', 'reportes'],
  coordinator: ['asistencia'],
  manager:     ['asistencia', 'personas'],
}

// ─── Status badge (module level) ─────────────────────────────────────────────

function ModuleStatusBadge({ status }: { status?: string }) {
  if (!status || status === 'available') return null
  const cfg: Record<string, { label: string; cls: string }> = {
    in_progress:       { label: 'Configurando',  cls: 'bg-amber-100 text-amber-700' },
    pending_migration: { label: 'Pendiente',      cls: 'bg-orange-100 text-orange-700' },
    error:             { label: 'Error',          cls: 'bg-red-100 text-red-700' },
    disabled:          { label: 'Inactivo',       cls: 'bg-slate-100 text-slate-500' },
  }
  const c = cfg[status]
  if (!c) return null
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>
  )
}

// ─── ERP Module Card ──────────────────────────────────────────────────────────

function ERPModuleCard({ mod, disabled, status, badgeCount }: {
  mod: ModuleDef
  disabled: boolean
  status: ModuleCatalogEntry['status']
  badgeCount?: number
}) {
  const Icon = mod.icon
  return (
    <div className={`group bg-white border border-slate-200 rounded-lg overflow-hidden transition-all duration-150 card-lift
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300'}`}
    >
      {/* Header strip */}
      <div className={`${mod.bgColor} px-3 py-2.5 flex items-center gap-2`}>
        <Icon size={14} className="text-white/90 flex-shrink-0" />
        <span className="text-white font-semibold text-xs flex-1 truncate">{mod.shortName}</span>
        {badgeCount != null && badgeCount > 0 && (
          <span className="min-w-[18px] h-4 px-1 rounded bg-white/25 text-white text-[10px] font-bold text-center leading-4">
            {badgeCount}
          </span>
        )}
        <ModuleStatusBadge status={status} />
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-1 mb-2">{mod.desc}</p>
        {/* Quick links */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {mod.quickLinks.map(link => (
            <Link
              key={link.href + link.label}
              href={link.href}
              onClick={e => e.stopPropagation()}
              className={`text-[10px] font-medium ${mod.accentColor} hover:underline`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 pb-2 flex items-center">
        <span className="text-[10px] text-slate-400">Módulo activo</span>
        <ChevronRight size={11} className="ml-auto text-slate-300 group-hover:text-slate-400 transition-colors" />
      </div>
    </div>
  )
}

// ─── Pending panel ────────────────────────────────────────────────────────────

function PendingPanel({ items, dismissed, onDismiss }: {
  items: PendingItem[]
  dismissed: Set<string | number>
  onDismiss: (id: string | number) => void
}) {
  const visible = items.filter(i => !dismissed.has(i.id))
  const typeIcon = (type: string) => type === 'approval' ? AlertTriangle : type === 'alert' ? AlertCircle : Bell
  const typeDot = (type: string) => type === 'approval' ? 'bg-orange-400' : type === 'alert' ? 'bg-red-400' : 'bg-blue-400'

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Pendientes</span>
        {visible.length > 0 && (
          <span className="min-w-[18px] h-4 px-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold flex items-center justify-center">
            {visible.length}
          </span>
        )}
      </div>
      {visible.length === 0 ? (
        <div className="px-3 py-5 flex items-center gap-2 text-xs text-slate-400">
          <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
          Sin tareas pendientes
        </div>
      ) : (
        <ul className="divide-y divide-slate-50 stagger-in">
          {visible.map(item => {
            const Icon = typeIcon(item.type)
            return (
              <li key={item.id} className="flex items-start gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${typeDot(item.type)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 font-medium leading-tight truncate">{item.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{item.module} · {item.date}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  className="text-slate-300 hover:text-slate-400 transition-colors flex-shrink-0 mt-0.5"
                >
                  <X size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Alert strip ──────────────────────────────────────────────────────────────

function AlertStrip({ alerts }: { alerts: { type: 'warning' | 'info'; text: string }[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="space-y-1.5">
      {alerts.map((a, i) => (
        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          ${a.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}
        >
          {a.type === 'warning'
            ? <AlertTriangle size={12} className="flex-shrink-0" />
            : <Bell size={12} className="flex-shrink-0" />
          }
          {a.text}
        </div>
      ))}
    </div>
  )
}

// ─── System status bar ────────────────────────────────────────────────────────

function SystemStatus() {
  const items = [
    { label: 'API', ok: true },
    { label: 'Relojes', ok: true },
    { label: 'BD', ok: true },
  ]
  return (
    <div className="flex items-center gap-3">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${item.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-[10px] text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main portal ─────────────────────────────────────────────────────────────

export default function PortalPage() {
  const user = useCurrentUser()
  const viewAs = typeof window !== 'undefined' ? getViewAs() : null

  const [catalogMap, setCatalogMap] = useState<Record<string, ModuleCatalogEntry>>({})
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingItem[]>([])
  const [dismissed, setDismissed] = useState<Set<string | number>>(new Set())
  const [stats, setStats] = useState<StatsState>({
    totalEmployees: '—', marcacionesHoy: '—', pendientes: '—', incidencias: '—'
  })

  const fechaHoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
  const horaHoy  = format(new Date(), 'HH:mm')

  useEffect(() => {
    api.get('/api/me/module-permissions-rbac')
      .then(res => {
        const data = res.data
        const map: Record<string, ModuleCatalogEntry> = {}
        if (Array.isArray(data?.module_catalog)) {
          for (const e of data.module_catalog as ModuleCatalogEntry[]) map[e.code] = e
        }
        if (data?.modules && typeof data.modules === 'object') {
          for (const [code, val] of Object.entries(data.modules as Record<string, Record<string, unknown>>)) {
            if (!map[code]) map[code] = { code }
            if (val?.status) map[code].status = val.status as ModuleCatalogEntry['status']
            if (val?.badge_count != null) map[code].badge_count = val.badge_count as number
          }
        }
        setCatalogMap(map)
      })
      .catch(() => {
        const map: Record<string, ModuleCatalogEntry> = {}
        for (const m of MODULES) map[m.code] = { code: m.code, status: 'available' }
        setCatalogMap(map)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.get('/api/approvals-sla?status=pending&limit=5')
      .then(res => {
        const arr = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
        setPending((arr as Record<string, unknown>[]).map(a => ({
          id: `approval-${a.id ?? Math.random()}`,
          title: (a.title ?? a.description ?? 'Aprobación pendiente') as string,
          module: (a.module ?? 'Permisos') as string,
          date: (a.created_at ?? a.date ?? '') as string,
          type: 'approval' as const,
        })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function loadStats() {
      let totalEmployees = '—', marcacionesHoy = '—', pendientes = '—', incidencias = '—'
      try {
        const r = await api.get('/api/attendance/live')
        const s = r.data?.stats ?? {}
        if (s.total_employees != null) totalEmployees = String(s.total_employees)
        marcacionesHoy = String((Number(s.present) || 0) + (Number(s.late) || 0))
        if (s.absent != null) incidencias = String(s.absent)
      } catch {}
      try {
        const r = await api.get('/api/approvals-sla?status=pending&limit=1')
        const total = r.data?.total ?? r.data?.count ?? (Array.isArray(r.data) ? r.data.length : null)
        if (total != null) pendientes = String(total)
      } catch {}
      setStats({ totalEmployees, marcacionesHoy, pendientes, incidencias })
    }
    loadStats()
  }, [])

  const getStatus  = (code: string) => catalogMap[code]?.status ?? 'available'
  const isDisabled = (code: string) => { const s = getStatus(code); return s === 'disabled' || s === 'error' }
  const displayName = user?.fullName || user?.username || 'Usuario'

  const visibleModules = viewAs && user?.role === 'super_admin'
    ? MODULES.filter(m => (ROLE_MODULES[viewAs.role] ?? []).includes(m.code))
    : MODULES

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-4">
        <div className="flex-1">
          <span className="text-xs font-semibold text-slate-800">
            Bienvenido, {displayName}
          </span>
          <span className="mx-2 text-slate-300">·</span>
          <span className="text-[11px] text-slate-400 capitalize">{fechaHoy} · {horaHoy}</span>
        </div>
        <SystemStatus />
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 border-b border-slate-200">
        {[
          { label: 'Empleados activos', value: stats.totalEmployees, icon: Users,         color: 'text-blue-600' },
          { label: 'Marcaciones hoy',   value: stats.marcacionesHoy, icon: Clock,         color: 'text-emerald-600' },
          { label: 'Aprobaciones',      value: stats.pendientes,     icon: AlertTriangle, color: 'text-orange-600' },
          { label: 'Incidencias',       value: stats.incidencias,    icon: AlertCircle,   color: 'text-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white px-4 py-3 flex items-center gap-3">
            <Icon size={16} className={`${color} flex-shrink-0`} />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
              <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main content ── */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">

        {/* Left: module grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {visibleModules.length} módulos disponibles
            </h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-lg border border-slate-200 h-28 skeleton-shimmer" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 stagger-in">
              {visibleModules.map(mod => {
                const disabled   = isDisabled(mod.code)
                const status     = getStatus(mod.code)
                const badgeCount = catalogMap[mod.code]?.badge_count
                const card = (
                  <ERPModuleCard mod={mod} disabled={disabled} status={status} badgeCount={badgeCount} />
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

          {/* Quick access row */}
          <div className="mt-5 bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
              <TrendingUp size={12} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">Accesos frecuentes</span>
            </div>
            <div className="flex flex-wrap gap-2 p-3">
              {[
                { label: 'Liquidaciones',    href: '/nomina/liquidaciones',   icon: DollarSign },
                { label: 'MTESS/REOP',       href: '/cumplimiento/mtess',     icon: Shield },
                { label: 'Marcaciones',      href: '/asistencia',             icon: Clock },
                { label: 'Reportes',         href: '/reportes',               icon: BarChart2 },
                { label: 'Aprobaciones',     href: '/aprobaciones',           icon: CheckCircle },
                { label: 'Auditoría',        href: '/auditoria',              icon: Activity },
                { label: 'Configuración',    href: '/configuracion',          icon: Settings },
                { label: 'Vacaciones',       href: '/vacaciones',             icon: Calendar },
                { label: 'Contratos',        href: '/personas/contratos',     icon: FileText },
                { label: 'IPS/REI',          href: '/cumplimiento/ips',       icon: Shield },
                { label: 'Tiempo Real',      href: '/asistencia/tiempo-real', icon: Radio },
                { label: 'Seguridad',        href: '/seguridad/roles',        icon: Lock },
              ].map(({ label, href, icon: Icon }) => (
                <Link
                  key={href + label}
                  href={href}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-medium transition-colors"
                >
                  <Icon size={11} className="text-slate-400" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <PendingPanel
            items={pending}
            dismissed={dismissed}
            onDismiss={id => setDismissed(prev => { const next = new Set(prev); next.add(id); return next })}
          />

          {/* Alerts */}
          <AlertStrip alerts={[
            { type: 'info', text: 'Presentaciones MTESS: revise vencimientos del mes' },
          ]} />

          {/* Compliance calendar preview */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={12} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">Vencimientos</span>
              </div>
              <Link href="/cumplimiento/calendario" className="text-[10px] text-blue-600 hover:underline">Ver todo</Link>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[11px] text-slate-400">
                Acceda al calendario de vencimientos MTESS e IPS desde el módulo de Cumplimiento Legal.
              </p>
              <Link
                href="/cumplimiento"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-medium"
              >
                Ir a Cumplimiento <ChevronRight size={10} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-4 border-t border-slate-200">
          <Activity size={10} />
          <span>RRHH Completo · {MODULES.length} módulos</span>
          <span className="ml-auto">{fechaHoy}</span>
        </div>
      </div>
    </div>
  )
}
