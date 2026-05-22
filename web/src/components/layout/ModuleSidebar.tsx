'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Clock, Calendar, BarChart2, Users, UserCheck, Building2, Settings,
  DollarSign, CreditCard, FileText, Star, CheckSquare,
  Shield, Database, Activity, ArrowLeft, ChevronRight,
  LayoutDashboard, Briefcase, MapPin, Radio, PiggyBank, RefreshCw,
  Layers, Plane, FolderOpen, Lock, Globe, EyeOff, Bell, Gift,
  TrendingUp, Download,
  type LucideIcon
} from 'lucide-react'
import clsx from 'clsx'

interface MenuItem { href: string; label: string; icon: LucideIcon }

const MODULE_ITEMS: Record<string, { title: string; color: string; items: MenuItem[] }> = {
  personas: {
    title: 'Gestión de Personas',
    color: 'text-blue-600',
    items: [
      { href: '/empleados',            label: 'Dashboard Personas',  icon: LayoutDashboard },
      { href: '/empleados',            label: 'Empleados',           icon: Users           },
      { href: '/cargos',               label: 'Cargos',              icon: Briefcase       },
      { href: '/departamentos',        label: 'Departamentos',       icon: Building2       },
      { href: '/configuracion/sedes',  label: 'Sucursales',          icon: MapPin          },
      { href: '/evaluaciones',         label: 'Evaluaciones',        icon: Star            },
      { href: '/onboarding',           label: 'Onboarding',          icon: UserCheck       },
    ],
  },
  asistencia: {
    title: 'Asistencia y Relojes',
    color: 'text-emerald-600',
    items: [
      { href: '/asistencia',              label: 'Dashboard Asistencia',  icon: LayoutDashboard },
      { href: '/asistencia',              label: 'Marcaciones',           icon: Clock           },
      { href: '/asistencia/tiempo-real',  label: 'Tiempo Real',           icon: Radio           },
      { href: '/sync/att2000',            label: 'Importación att2000',   icon: Database        },
      { href: '/configuracion/turnos',    label: 'Horarios y Turnos',     icon: Calendar        },
      { href: '/permisos',                label: 'Permisos',              icon: Calendar        },
      { href: '/aprobaciones',            label: 'Aprobaciones',          icon: CheckSquare     },
      { href: '/banco-horas',             label: 'Banco de Horas',        icon: PiggyBank       },
      { href: '/sync/att2000',            label: 'Reconciliación',        icon: RefreshCw       },
    ],
  },
  nomina: {
    title: 'Nómina y Liquidaciones',
    color: 'text-violet-600',
    items: [
      { href: '/nomina',                label: 'Dashboard Nómina',      icon: LayoutDashboard },
      { href: '/nomina/liquidaciones',  label: 'Liquidaciones',         icon: DollarSign      },
      { href: '/nomina/conceptos',      label: 'Conceptos Salariales',  icon: Layers          },
      { href: '/nomina/aguinaldo',      label: 'Aguinaldo',             icon: Gift            },
      { href: '/vacaciones',            label: 'Vacaciones',            icon: Plane           },
      { href: '/nomina/anticipos',      label: 'Anticipos',             icon: PiggyBank       },
    ],
  },
  pagos: {
    title: 'Pagos y Bancos',
    color: 'text-orange-600',
    items: [
      { href: '/bancos',  label: 'Dashboard Pagos',  icon: LayoutDashboard },
      { href: '/bancos',  label: 'Bancos',           icon: CreditCard      },
    ],
  },
  documentos: {
    title: 'Documentos',
    color: 'text-amber-600',
    items: [
      { href: '/documentos',  label: 'Documentos',  icon: FolderOpen },
      { href: '/documentos',  label: 'Plantillas',  icon: FileText   },
    ],
  },
  seguridad: {
    title: 'Seguridad y Permisos',
    color: 'text-indigo-600',
    items: [
      { href: '/usuarios',                    label: 'Usuarios',          icon: Users   },
      { href: '/seguridad/roles',             label: 'Roles',             icon: Shield  },
      { href: '/seguridad/permisos',          label: 'Permisos',          icon: Lock    },
      { href: '/seguridad/alcances',          label: 'Alcances',          icon: Globe   },
      { href: '/seguridad/campos-sensibles',  label: 'Campos Sensibles',  icon: EyeOff  },
    ],
  },
  configuracion: {
    title: 'Configuración',
    color: 'text-slate-600',
    items: [
      { href: '/configuracion',                   label: 'General',           icon: Settings  },
      { href: '/notificaciones-config',           label: 'Notificaciones',    icon: Bell      },
      { href: '/configuracion/feriados',          label: 'Feriados',          icon: Calendar  },
      { href: '/configuracion/integraciones-hr',  label: 'Integraciones HR',  icon: Layers    },
      { href: '/configuracion/firma',             label: 'Firma Digital',     icon: FileText  },
      { href: '/sistema/salud',                   label: 'Salud del Sistema', icon: Activity  },
      { href: '/sistema/backups',                 label: 'Backups',           icon: Database  },
    ],
  },
  auditoria: {
    title: 'Auditoría',
    color: 'text-gray-600',
    items: [
      { href: '/auditoria',  label: 'Auditoría',  icon: Activity },
    ],
  },
  // Legacy keys kept for backward compat
  empleados: {
    title: 'Empleados',
    color: 'text-blue-600',
    items: [
      { href: '/empleados',      label: 'Listado',         icon: Users       },
      { href: '/empleados/nuevo',label: 'Nuevo empleado',  icon: UserCheck   },
      { href: '/departamentos',  label: 'Departamentos',   icon: Building2   },
      { href: '/cargos',         label: 'Cargos',          icon: Briefcase   },
    ],
  },
  cumplimiento: {
    title: 'Cumplimiento Legal',
    color: 'text-red-600',
    items: [
      { href: '/cumplimiento',  label: 'Panel MTESS/IPS',  icon: Shield    },
      { href: '/reportes',      label: 'Exportaciones',    icon: Download  },
    ],
  },
  competencias: {
    title: 'Competencias',
    color: 'text-pink-600',
    items: [
      { href: '/competencias',         label: 'Evaluaciones',      icon: Star        },
      { href: '/competencias/planes',  label: 'Planes de carrera', icon: TrendingUp  },
      { href: '/evaluaciones',         label: 'Desempeño 360°',    icon: Users       },
    ],
  },
  reportes: {
    title: 'Reportes y Analítica',
    color: 'text-cyan-600',
    items: [
      { href: '/reportes',               label: 'Reportes operativos',   icon: BarChart2  },
      { href: '/reportes/personalizado', label: 'Reporte personalizado', icon: Layers     },
      { href: '/ejecutivo',              label: 'Dashboard ejecutivo',   icon: TrendingUp },
    ],
  },
}

interface Props {
  moduleKey: string
}

export default function ModuleSidebar({ moduleKey }: Props) {
  const pathname = usePathname()
  const mod = MODULE_ITEMS[moduleKey]
  if (!mod) return null

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-100 min-h-full py-4 flex flex-col">
      {/* Back to portal */}
      <Link
        href="/portal"
        className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500 hover:text-slate-700 mb-2 group"
      >
        <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
        Portal
      </Link>

      {/* Module title */}
      <div className={`px-4 mb-3 font-bold text-sm ${mod.color}`}>
        {mod.title}
      </div>

      {/* Menu items */}
      <nav className="flex-1 space-y-0.5 px-2">
        {mod.items.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-slate-100 text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon size={15} className={active ? mod.color : 'text-slate-400'} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={12} className="text-slate-400" />}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
