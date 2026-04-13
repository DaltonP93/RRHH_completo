'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, BarChart2, Settings, Clock, Calendar, LogOut, Shield, TrendingUp } from 'lucide-react'
import clsx from 'clsx'

const nav = [
  { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard'      },
  { href: '/empleados',     icon: Users,            label: 'Empleados'     },
  { href: '/asistencia',    icon: Clock,            label: 'Asistencia'    },
  { href: '/permisos',      icon: Calendar,         label: 'Permisos'      },
  { href: '/reportes',      icon: BarChart2,        label: 'Reportes'      },
  { href: '/usuarios',      icon: Shield,           label: 'Usuarios'      },
  { href: '/configuracion', icon: Settings,         label: 'Configuración' },
]

export default function Sidebar() {
  const pathname = usePathname()

  function handleLogout() {
    const refresh = localStorage.getItem('refresh_token')
    if (refresh) fetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: refresh }) })
    localStorage.clear()
    window.location.href = '/login'
  }

  return (
    <aside className="w-64 bg-slate-900 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Clock size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Asistencia</p>
            <p className="text-slate-400 text-xs">Recursos Humanos</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-slate-700">
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
