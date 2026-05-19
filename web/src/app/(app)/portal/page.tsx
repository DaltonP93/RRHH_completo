'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Clock, DollarSign, CreditCard, FolderOpen, Star, Shield,
  BarChart2, Settings, Lock, Activity, CheckSquare, Loader2, AlertCircle
} from 'lucide-react'
import { api } from '@/lib/api'
import { useCurrentUser } from '@/lib/useCurrentUser'

interface ModuleDef {
  code: string
  name: string
  desc: string
  icon: React.ElementType
  route: string
  color: string
  perm: string
}

interface ModuleCatalogEntry {
  code: string
  status?: 'available' | 'in_progress' | 'pending_migration' | 'error' | 'disabled'
  badge_count?: number
}

const MODULES: ModuleDef[] = [
  { code: 'personas',      name: 'Gestión de Personas',    desc: 'Empleados, contratos, cargos, legajos y datos laborales.',                                                          icon: Users,        route: '/empleados',        color: 'bg-blue-600',    perm: 'people.view' },
  { code: 'asistencia',    name: 'Asistencia y Relojes',   desc: 'Marcaciones, horarios, turnos, ZKTeco, app móvil y tiempo real.',                                                    icon: Clock,        route: '/asistencia',       color: 'bg-emerald-600', perm: 'attendance.view' },
  { code: 'nomina',        name: 'Nómina y Liquidaciones', desc: 'Conceptos salariales, liquidaciones, IPS, aguinaldo, vacaciones, preaviso e indemnización.',                         icon: DollarSign,   route: '/nomina',           color: 'bg-violet-600',  perm: 'payroll.view' },
  { code: 'pagos',         name: 'Pagos y Bancos',         desc: 'Lotes de pago, archivos bancarios, cuentas y validación de pagos.',                                                  icon: CreditCard,   route: '/bancos',           color: 'bg-orange-600',  perm: 'payments.view' },
  { code: 'documentos',    name: 'Documentos',             desc: 'Plantillas, expedientes, firma electrónica y auditoría documental.',                                                 icon: FolderOpen,   route: '/documentos',       color: 'bg-amber-600',   perm: 'documents.view' },
  { code: 'competencias',  name: 'Competencias',           desc: 'Evaluaciones de desempeño, planes de desarrollo y 360°.',                                                            icon: Star,         route: '/competencias',     color: 'bg-pink-600',    perm: 'competencies.view' },
  { code: 'cumplimiento',  name: 'Cumplimiento Legal',     desc: 'MTESS, IPS, exportaciones y reportes regulatorios.',                                                                 icon: Shield,       route: '/cumplimiento',     color: 'bg-red-600',     perm: 'compliance.view' },
  { code: 'reportes',      name: 'Reportes y Analítica',   desc: 'Informes operativos, dashboards ejecutivos y análisis avanzado.',                                                    icon: BarChart2,    route: '/reportes',         color: 'bg-cyan-600',    perm: 'reports.view' },
  { code: 'configuracion', name: 'Configuración',          desc: 'Parámetros del sistema, integraciones, notificaciones y relojes.',                                                   icon: Settings,     route: '/configuracion',    color: 'bg-slate-600',   perm: 'settings.view' },
  { code: 'seguridad',     name: 'Seguridad y Permisos',   desc: 'Usuarios, roles, permisos granulares y alcances multiempresa.',                                                      icon: Lock,         route: '/seguridad/roles',  color: 'bg-indigo-600',  perm: 'security.view' },
  { code: 'auditoria',     name: 'Auditoría',              desc: 'Registro de eventos, cambios y accesos para trazabilidad.',                                                          icon: Activity,     route: '/auditoria',        color: 'bg-gray-600',    perm: 'audit.view' },
]

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

export default function PortalPage() {
  const user = useCurrentUser()
  const [catalogMap, setCatalogMap] = useState<Record<string, ModuleCatalogEntry>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/api/me/module-permissions-rbac')
        const data = res.data
        const map: Record<string, ModuleCatalogEntry> = {}

        // module_catalog is an array
        if (Array.isArray(data?.module_catalog)) {
          for (const entry of data.module_catalog) {
            map[entry.code] = entry
          }
        }
        // modules is a key→value object with permissions
        if (data?.modules && typeof data.modules === 'object') {
          for (const [code, val] of Object.entries(data.modules as Record<string, any>)) {
            if (!map[code]) map[code] = { code }
            if (val?.status) map[code].status = val.status
            if (val?.badge_count != null) map[code].badge_count = val.badge_count
          }
        }

        setCatalogMap(map)
      } catch {
        // Fallback: show all as available
        const map: Record<string, ModuleCatalogEntry> = {}
        for (const m of MODULES) map[m.code] = { code: m.code, status: 'available' }
        setCatalogMap(map)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function getStatus(code: string): ModuleCatalogEntry['status'] {
    return catalogMap[code]?.status ?? 'available'
  }

  function isDisabled(code: string) {
    const s = getStatus(code)
    return s === 'disabled' || s === 'pending_migration' || s === 'error'
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          {user ? `Bienvenido, ${(user as any).name || (user as any).username}` : 'Portal de Módulos'}
        </h1>
        <p className="text-slate-500 mt-1">Selecciona el módulo con el que deseas trabajar</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map(mod => {
            const Icon = mod.icon
            const status = getStatus(mod.code)
            const disabled = isDisabled(mod.code)
            const badgeCount = catalogMap[mod.code]?.badge_count

            const card = (
              <div
                className={`group relative bg-white rounded-2xl border shadow-sm p-6 transition-all h-full
                  ${disabled
                    ? 'opacity-60 cursor-not-allowed border-slate-100'
                    : 'border-slate-100 hover:shadow-md hover:border-slate-200 cursor-pointer'
                  }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${mod.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="text-white" size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <h2 className="font-bold text-slate-900 text-lg leading-tight">{mod.name}</h2>
                      {badgeCount != null && badgeCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          {badgeCount}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">{mod.desc}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge status={status} />
                      {disabled && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <CheckSquare size={11} /> Configuración pendiente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        <Activity size={12} />
        <span>{MODULES.length} módulos disponibles</span>
      </div>
    </div>
  )
}
