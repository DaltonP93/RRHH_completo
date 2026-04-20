'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, BarChart2, Settings, Clock, Calendar,
  LogOut, Shield, Server, Building2, CheckSquare, UserCircle2,
  type LucideIcon
} from 'lucide-react'
import clsx from 'clsx'
import { useCurrentUser, hasRole, isSuperAdmin, type Role } from '@/lib/useCurrentUser'

type NavItem = {
  href: string
  icon: LucideIcon
  label: string
  roles?: Role[]      // roles permitidos (super_admin siempre ve todo)
  superOnly?: boolean // solo super_admin
}

const NAV: NavItem[] = [
  // ─── Portal del empleado ────────────────────────────────────
  { href: '/mi-perfil',     icon: UserCircle2,     label: 'Mi perfil',     roles: ['employee','admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/mi-asistencia', icon: Clock,           label: 'Mi asistencia', roles: ['employee'] },
  { href: '/mis-permisos',  icon: Calendar,        label: 'Mis permisos',  roles: ['employee'] },

  // ─── Gestión interna ─────────────────────────────────────────
  { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard',    roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/empleados',     icon: Users,           label: 'Empleados',    roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/asistencia',    icon: Clock,           label: 'Asistencia',   roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/permisos',      icon: Calendar,        label: 'Permisos',     roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/aprobaciones',  icon: CheckSquare,     label: 'Aprobaciones', roles: ['admin','gth','hr','coordinator','manager'] },
  { href: '/reportes',      icon: BarChart2,       label: 'Reportes',     roles: ['admin','gth','hr','manager','gestor'] },
  { href: '/departamentos', icon: Building2,       label: 'Departamentos', roles: ['admin','gth'] },
  { href: '/usuarios',      icon: Shield,          label: 'Usuarios',     roles: ['admin','gth'] },
  { href: '/configuracion', icon: Settings,        label: 'Configuración', roles: ['admin','gth'] },
  { href: '/sistema',       icon: Server,          label: 'Sistema',      superOnly: true },
]

export default function Sidebar() {
  const pathname = usePathname()
  const user = useCurrentUser()

  const items = NAV.filter(item => {
    if (item.superOnly) return isSuperAdmin(user)
    if (!item.roles) return true
    return hasRole(user, ...item.roles)
  })

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
            <p className="text-slate-400 text-xs">
              {user?.role === 'super_admin' ? 'Super Admin' : 'Recursos Humanos'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map(({ href, icon: Icon, label }) => {
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

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-slate-700 space-y-2">
        {user && (
          <div className="px-3 py-2 text-xs text-slate-400">
            <p className="text-slate-200 font-medium truncate">{user.fullName || user.username}</p>
            <p className="truncate capitalize">{user.role.replace('_', ' ')}</p>
          </div>
        )}
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
