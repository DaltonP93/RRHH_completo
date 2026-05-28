'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Clock, Calendar, BarChart2, Users, UserCheck, Building2, Settings,
  DollarSign, CreditCard, FileText, Star, CheckSquare,
  Shield, Database, Activity, ArrowLeft, ChevronRight,
  LayoutDashboard, Briefcase, MapPin, Radio, PiggyBank, RefreshCw,
  Layers, Plane, FolderOpen, Lock, Globe, EyeOff, Bell, Gift,
  TrendingUp, Download, BookOpen, Award, GraduationCap, Landmark,
  ClipboardList, Send, AlignLeft, History, UserPlus, Banknote,
  AlertCircle, FileClock, type LucideIcon
} from 'lucide-react'
import clsx from 'clsx'

interface MenuItem { href: string; label: string; icon: LucideIcon }

const MODULE_ITEMS: Record<string, { title: string; color: string; items: MenuItem[] }> = {
  personas: {
    title: 'Gestión de Personas',
    color: 'text-blue-600',
    items: [
      { href: '/empleados',                   label: 'Dashboard Personas',   icon: LayoutDashboard },
      { href: '/empleados',                   label: 'Empleados',            icon: Users           },
      { href: '/personas/legajos',            label: 'Legajos',              icon: FolderOpen      },
      { href: '/personas/contratos',          label: 'Contratos',            icon: FileText        },
      { href: '/personas/familiares',         label: 'Familiares',           icon: Users           },
      { href: '/personas/formacion',          label: 'Formación y Títulos',  icon: GraduationCap   },
      { href: '/personas/historico-salarial', label: 'Histórico Salarial',   icon: History         },
      { href: '/cargos',                      label: 'Cargos',               icon: Briefcase       },
      { href: '/departamentos',               label: 'Departamentos',        icon: Building2       },
      { href: '/personas/sucursales',         label: 'Sucursales',           icon: MapPin          },
      { href: '/evaluaciones',                label: 'Evaluaciones',         icon: Star            },
      { href: '/onboarding',                  label: 'Onboarding',           icon: UserCheck       },
    ],
  },
  asistencia: {
    title: 'Asistencia y Relojes',
    color: 'text-emerald-600',
    items: [
      { href: '/asistencia',                     label: 'Dashboard Asistencia', icon: LayoutDashboard },
      { href: '/asistencia',                     label: 'Marcaciones',          icon: Clock           },
      { href: '/asistencia/tiempo-real',         label: 'Tiempo Real',          icon: Radio           },
      { href: '/configuracion/turnos',           label: 'Horarios y Turnos',    icon: Calendar        },
      { href: '/permisos',                       label: 'Permisos',             icon: Calendar        },
      { href: '/aprobaciones',                   label: 'Aprobaciones',         icon: CheckSquare     },
      { href: '/banco-horas',                    label: 'Banco de Horas',       icon: PiggyBank       },
      { href: '/sync/att2000',                   label: 'Importación att2000',  icon: Database        },
      { href: '/asistencia/conciliacion',          label: 'Reconciliación',       icon: RefreshCw       },
      { href: '/asistencia/relojes/diagnostico', label: 'Diagnóstico Relojes',  icon: Activity        },
    ],
  },
  nomina: {
    title: 'Nómina y Liquidaciones',
    color: 'text-violet-600',
    items: [
      { href: '/nomina',                    label: 'Dashboard Nómina',        icon: LayoutDashboard },
      { href: '/nomina/liquidaciones',      label: 'Liquidaciones',           icon: DollarSign      },
      { href: '/nomina/conceptos-fijos',    label: 'Conceptos Fijos',         icon: Layers          },
      { href: '/nomina/conceptos',          label: 'Conceptos Salariales',    icon: AlignLeft       },
      { href: '/nomina/parametros',         label: 'Parámetros Mensuales',    icon: Settings        },
      { href: '/nomina/tipos-nomina',       label: 'Tipos de Nómina',         icon: ClipboardList   },
      { href: '/nomina/preavisos',          label: 'Preavisos',               icon: AlertCircle     },
      { href: '/nomina/premios',            label: 'Premios y Bonos',         icon: Award           },
      { href: '/nomina/retenciones',        label: 'Retenciones Judiciales',  icon: Shield          },
      { href: '/nomina/liquidacion-salida', label: 'Liquidación de Salida',   icon: FileClock       },
      { href: '/nomina/aguinaldo',          label: 'Aguinaldo',               icon: Gift            },
      { href: '/vacaciones',               label: 'Vacaciones',              icon: Plane           },
      { href: '/nomina/anticipos',          label: 'Anticipos',               icon: PiggyBank       },
    ],
  },
  pagos: {
    title: 'Pagos y Bancos',
    color: 'text-orange-600',
    items: [
      { href: '/bancos',                   label: 'Dashboard Pagos',       icon: LayoutDashboard },
      { href: '/bancos',                   label: 'Bancos',                icon: Landmark        },
      { href: '/bancos/cuentas-empleados', label: 'Cuentas Empleados',     icon: CreditCard      },
      { href: '/bancos/lotes',             label: 'Lotes de Pago',         icon: Banknote        },
      { href: '/bancos/pagos',             label: 'Historial de Pagos',    icon: History         },
      { href: '/bancos/exportacion',       label: 'Exportación Bancaria',  icon: Download        },
    ],
  },
  documentos: {
    title: 'Documentos',
    color: 'text-amber-600',
    items: [
      { href: '/documentos',             label: 'Documentos',           icon: FolderOpen    },
      { href: '/documentos',             label: 'Plantillas',           icon: FileText      },
      { href: '/documentos/expedientes', label: 'Expedientes',          icon: BookOpen      },
      { href: '/documentos/legajos',     label: 'Legajos Digitales',    icon: FolderOpen    },
      { href: '/documentos/firma',       label: 'Firma Electrónica',    icon: AlignLeft     },
      { href: '/documentos/laborales',   label: 'Documentos Laborales', icon: ClipboardList },
      { href: '/documentos/constancias', label: 'Constancias',          icon: Award         },
    ],
  },
  seguridad: {
    title: 'Seguridad y Permisos',
    color: 'text-indigo-600',
    items: [
      { href: '/usuarios',                   label: 'Usuarios',             icon: Users         },
      { href: '/seguridad/roles',            label: 'Roles',                icon: Shield        },
      { href: '/seguridad/permisos',         label: 'Permisos',             icon: Lock          },
      { href: '/seguridad/alcances',         label: 'Alcances',             icon: Globe         },
      { href: '/seguridad/campos-sensibles', label: 'Campos Sensibles',     icon: EyeOff        },
      { href: '/seguridad/sesiones',         label: 'Sesiones Activas',     icon: Activity      },
      { href: '/auditoria',                  label: 'Auditoría de Accesos', icon: ClipboardList },
    ],
  },
  configuracion: {
    title: 'Configuración',
    color: 'text-slate-600',
    items: [
      { href: '/configuracion',                  label: 'General',              icon: Settings  },
      { href: '/configuracion/empresas',         label: 'Empresas',             icon: Building2 },
      { href: '/configuracion/parametros',       label: 'Parámetros Generales', icon: Layers    },
      { href: '/configuracion/bancos',           label: 'Bancos y Entidades',   icon: Landmark  },
      { href: '/notificaciones-config',          label: 'Notificaciones',       icon: Bell      },
      { href: '/configuracion/feriados',         label: 'Feriados',             icon: Calendar  },
      { href: '/configuracion/integraciones-hr', label: 'Integraciones HR',     icon: Layers    },
      { href: '/configuracion/firma',            label: 'Firma Digital',        icon: FileText  },
      { href: '/sistema/salud',                  label: 'Salud del Sistema',    icon: Activity  },
      { href: '/sistema/backups',                label: 'Backups',              icon: Database  },
    ],
  },
  auditoria: {
    title: 'Auditoría',
    color: 'text-gray-600',
    items: [
      { href: '/auditoria', label: 'Auditoría', icon: Activity },
    ],
  },
  empleados: {
    title: 'Empleados',
    color: 'text-blue-600',
    items: [
      { href: '/empleados',        label: 'Listado',         icon: Users     },
      { href: '/empleados/nuevo',  label: 'Nuevo empleado',  icon: UserPlus  },
      { href: '/departamentos',    label: 'Departamentos',   icon: Building2 },
      { href: '/cargos',           label: 'Cargos',          icon: Briefcase },
    ],
  },
  cumplimiento: {
    title: 'Cumplimiento Legal',
    color: 'text-red-600',
    items: [
      { href: '/cumplimiento',              label: 'Panel General',           icon: LayoutDashboard },
      { href: '/cumplimiento/mtess',        label: 'MTESS / REOP',            icon: Send            },
      { href: '/cumplimiento/ips',          label: 'IPS / REI',               icon: Shield          },
      { href: '/cumplimiento/planillas',    label: 'Planillas Laborales',     icon: ClipboardList   },
      { href: '/cumplimiento/altas-bajas',  label: 'Altas y Bajas',           icon: UserPlus        },
      { href: '/cumplimiento/exportaciones',label: 'Exportaciones',           icon: Download        },
      { href: '/cumplimiento/acuses',       label: 'Acuses de Recibo',        icon: CheckSquare     },
      { href: '/cumplimiento/calendario',   label: 'Calendario Vencimientos', icon: Calendar        },
    ],
  },
  competencias: {
    title: 'Competencias y Desempeño',
    color: 'text-pink-600',
    items: [
      { href: '/competencias',              label: 'Evaluaciones',           icon: Star         },
      { href: '/competencias/matriz',       label: 'Matriz de Competencias', icon: Layers       },
      { href: '/competencias/categorias',   label: 'Categorías',             icon: BookOpen     },
      { href: '/competencias/niveles',      label: 'Niveles',                icon: AlignLeft    },
      { href: '/competencias/ciclos',       label: 'Ciclos de Desempeño',    icon: RefreshCw    },
      { href: '/competencias/planes',       label: 'Planes de Carrera',      icon: TrendingUp   },
      { href: '/competencias/capacitacion', label: 'Capacitación',           icon: GraduationCap},
      { href: '/competencias/catalogo',     label: 'Catálogo de Cursos',     icon: BookOpen     },
      { href: '/evaluaciones',              label: 'Desempeño 360°',         icon: Users        },
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

export default function ModuleSidebar({ moduleKey }: { moduleKey: string }) {
  const pathname = usePathname()
  const mod = MODULE_ITEMS[moduleKey]
  if (!mod) return null

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-100 min-h-full flex flex-col">
      {/* Back to portal */}
      <Link
        href="/portal"
        className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-slate-400 hover:text-slate-600 border-b border-slate-100 group transition-colors"
      >
        <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
        Portal principal
      </Link>

      {/* Module title */}
      <div className={`px-3 py-2.5 font-bold text-xs uppercase tracking-wide border-b border-slate-100 ${mod.color}`}>
        {mod.title}
      </div>

      {/* Menu items */}
      <nav className="flex-1 py-1 overflow-y-auto">
        {mod.items.map((item, idx) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={`${item.href}-${idx}`}
              href={item.href}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors',
                active
                  ? 'bg-slate-50 text-slate-900 font-semibold border-l-2 border-slate-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 border-l-2 border-transparent'
              )}
            >
              <Icon size={13} className={active ? mod.color : 'text-slate-400'} />
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight size={10} className="text-slate-400 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
