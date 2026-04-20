'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Users, BarChart2, Settings, Clock, Calendar,
  LogOut, Shield, Server, Building2, CheckSquare, UserCircle2,
  Menu, X, FileText,
  type LucideIcon
} from 'lucide-react'
import clsx from 'clsx'
import { useCurrentUser, hasRole, isSuperAdmin, type Role } from '@/lib/useCurrentUser'

type NavItem = {
  href: string
  icon: LucideIcon
  label: string
  roles?: Role[]
  superOnly?: boolean
  section?: 'portal' | 'gestion' | 'admin'
}

const NAV: NavItem[] = [
  // Portal del empleado
  { href: '/mi-perfil',     icon: UserCircle2,     label: 'Mi perfil',     section: 'portal', roles: ['employee','admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/mi-asistencia', icon: Clock,           label: 'Mi asistencia', section: 'portal', roles: ['employee'] },
  { href: '/mis-permisos',  icon: Calendar,        label: 'Mis permisos',  section: 'portal', roles: ['employee'] },

  // Gestión
  { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard',     section: 'gestion', roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/empleados',     icon: Users,           label: 'Empleados',     section: 'gestion', roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/asistencia',    icon: Clock,           label: 'Asistencia',    section: 'gestion', roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/permisos',      icon: Calendar,        label: 'Permisos',      section: 'gestion', roles: ['admin','gth','hr','coordinator','manager','gestor','supervisor'] },
  { href: '/aprobaciones',  icon: CheckSquare,     label: 'Aprobaciones',  section: 'gestion', roles: ['admin','gth','hr','coordinator','manager'] },
  { href: '/reportes',      icon: BarChart2,       label: 'Reportes',      section: 'gestion', roles: ['admin','gth','hr','manager','gestor'] },

  // Admin
  { href: '/departamentos', icon: Building2,       label: 'Departamentos', section: 'admin', roles: ['admin','gth'] },
  { href: '/usuarios',      icon: Shield,          label: 'Usuarios',      section: 'admin', roles: ['admin','gth'] },
  { href: '/auditoria',     icon: FileText,        label: 'Auditoría',     section: 'admin', roles: ['admin','gth'] },
  { href: '/configuracion', icon: Settings,        label: 'Configuración', section: 'admin', roles: ['admin','gth'] },
  { href: '/sistema',       icon: Server,          label: 'Sistema',       section: 'admin', superOnly: true },
]

const SECTION_LABEL: Record<string, string> = {
  portal:  'Mi área',
  gestion: 'Gestión',
  admin:   'Administración',
}

interface SidebarSettings {
  system_sidebar_bg?: string
  system_sidebar_text?: string
  system_sidebar_active?: string
  system_name?: string
}

export default function Sidebar() {
  const pathname = usePathname()
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<SidebarSettings>({})

  // Carga settings de tema (sin bloquear render)
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    fetch(`${apiUrl}/api/settings`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTheme(d) })
      .catch(() => {})
  }, [])

  // Cerrar drawer al navegar (mobile)
  useEffect(() => { setOpen(false) }, [pathname])

  const items = NAV.filter(item => {
    if (item.superOnly) return isSuperAdmin(user)
    if (!item.roles) return true
    return hasRole(user, ...item.roles)
  })

  // Agrupar por sección preservando orden
  const sections: Record<string, NavItem[]> = {}
  for (const it of items) {
    const sec = it.section || 'gestion'
    if (!sections[sec]) sections[sec] = []
    sections[sec].push(it)
  }

  function handleLogout() {
    const refresh = localStorage.getItem('refresh_token')
    if (refresh) fetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: refresh }) })
    localStorage.clear()
    window.location.href = '/login'
  }

  const bg         = theme.system_sidebar_bg     || '#0f172a'
  const textColor  = theme.system_sidebar_text   || '#94a3b8'
  const activeBg   = theme.system_sidebar_active || '#2563eb'

  const Content = (
    <>
      {/* Logo / branding */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                 style={{ backgroundColor: activeBg }}>
              <Clock size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">{theme.system_name || 'Asistencia'}</p>
              <p className="text-xs truncate" style={{ color: textColor }}>
                {user?.role === 'super_admin' ? 'Super Admin'
                 : user?.role === 'employee' ? 'Empleado'
                 : 'Recursos Humanos'}
              </p>
            </div>
          </div>
          <button className="md:hidden text-white/80 hover:text-white" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Nav con secciones */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {(['portal','gestion','admin'] as const).map(sec => {
          const list = sections[sec]
          if (!list?.length) return null
          return (
            <div key={sec} className="space-y-1">
              <p className="px-3 text-[10px] uppercase tracking-widest font-semibold"
                 style={{ color: textColor, opacity: 0.6 }}>
                {SECTION_LABEL[sec]}
              </p>
              {list.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link key={href} href={href}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all'
                    )}
                    style={active
                      ? { backgroundColor: activeBg, color: '#fff' }
                      : { color: textColor }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#fff' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = textColor }}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {user && (
          <div className="px-3 py-2 text-xs" style={{ color: textColor }}>
            <p className="text-white font-medium truncate">{user.fullName || user.username}</p>
            <p className="truncate capitalize">{user.role.replace('_', ' ')}</p>
          </div>
        )}
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5 hover:text-white"
          style={{ color: textColor }}
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Hamburger (mobile only) */}
      <button
        aria-label="Abrir menú"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-xl bg-slate-900 text-white shadow-lg"
      >
        <Menu size={20} />
      </button>

      {/* Overlay mobile */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-40"
        />
      )}

      {/* Drawer / sidebar */}
      <aside
        className={clsx(
          'w-64 min-h-screen flex flex-col z-50',
          'fixed md:sticky top-0 left-0 transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
        style={{ backgroundColor: bg, maxHeight: '100vh' }}
      >
        {Content}
      </aside>
    </>
  )
}
