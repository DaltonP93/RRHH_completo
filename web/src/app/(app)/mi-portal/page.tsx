'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserCircle2, Clock, Calendar, QrCode, Bell, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useCurrentUser } from '@/lib/useCurrentUser'

interface EmployeeModule {
  name: string
  desc: string
  icon: React.ElementType
  route: string
  color: string
}

const EMPLOYEE_MODULES: EmployeeModule[] = [
  {
    name: 'Mi Perfil',
    desc: 'Consulta y actualiza tus datos personales y laborales.',
    icon: UserCircle2,
    route: '/mi-perfil',
    color: 'bg-blue-600',
  },
  {
    name: 'Mi Asistencia',
    desc: 'Revisa tu historial de marcaciones, horarios y resumen diario.',
    icon: Clock,
    route: '/mi-asistencia',
    color: 'bg-emerald-600',
  },
  {
    name: 'Mis Permisos',
    desc: 'Solicita y consulta el estado de tus permisos y ausencias.',
    icon: Calendar,
    route: '/mis-permisos',
    color: 'bg-violet-600',
  },
  {
    name: 'Marcar QR/GPS',
    desc: 'Registra tu entrada o salida mediante código QR o ubicación GPS.',
    icon: QrCode,
    route: '/marcar',
    color: 'bg-orange-600',
  },
  {
    name: 'Mis Notificaciones',
    desc: 'Revisa avisos, alertas y novedades de RRHH.',
    icon: Bell,
    route: '/mis-notificaciones',
    color: 'bg-pink-600',
  },
]

export default function MiPortalPage() {
  const user = useCurrentUser()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Could load employee-specific data or module availability here
    async function load() {
      try {
        await api.get('/api/me/profile')
      } catch {
        // Silently ignore — portal still renders
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          {user
            ? `Bienvenido, ${(user as any).fullName || (user as any).name || user.username}`
            : 'Portal del Empleado'}
        </h1>
        <p className="text-slate-500 mt-1">Portal del Empleado</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {EMPLOYEE_MODULES.map(mod => {
            const Icon = mod.icon
            return (
              <Link key={mod.route} href={mod.route} className="block group">
                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-6 transition-all h-full hover:shadow-md hover:border-slate-200 cursor-pointer">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl ${mod.color} flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon className="text-white" size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-slate-900 text-lg leading-tight mb-0.5">
                        {mod.name}
                      </h2>
                      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{mod.desc}</p>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        <Bell size={12} />
        <span>{EMPLOYEE_MODULES.length} secciones disponibles</span>
      </div>
    </div>
  )
}
