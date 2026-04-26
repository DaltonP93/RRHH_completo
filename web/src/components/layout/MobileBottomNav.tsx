'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Clock, BarChart2, User } from 'lucide-react'
import { useCurrentUser } from '@/lib/useCurrentUser'

/**
 * Barra de navegación inferior visible solo en mobile.
 * Complementa al Sidebar (que está oculto detrás de un drawer en mobile)
 * con accesos rápidos a las páginas más usadas.
 */
export default function MobileBottomNav() {
  const pathname = usePathname()
  const user = useCurrentUser()
  const isEmployee = user?.role === 'employee'

  // Items distintos según rol
  const items = isEmployee ? [
    { href: '/mi-perfil',     label: 'Perfil',       icon: User },
    { href: '/mi-asistencia', label: 'Asistencia',   icon: Clock },
    { href: '/marcar',        label: 'Marcar',       icon: Clock },
    { href: '/mis-permisos',  label: 'Permisos',     icon: BarChart2 },
  ] : [
    { href: '/dashboard',  label: 'Inicio',     icon: LayoutDashboard },
    { href: '/empleados',  label: 'Empleados',  icon: Users },
    { href: '/asistencia', label: 'Asistencia', icon: Clock },
    { href: '/reportes',   label: 'Reportes',   icon: BarChart2 },
  ]

  // Ocultar en /login, /kiosk, etc.
  if (!user) return null
  if (pathname.startsWith('/login') || pathname.startsWith('/kiosk')) return null

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-lg pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación inferior">
      <div className="grid grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
              aria-current={active ? 'page' : undefined}>
              <Icon size={20} aria-hidden="true" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
