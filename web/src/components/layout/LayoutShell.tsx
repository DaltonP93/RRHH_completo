'use client'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import ModuleSidebar from '@/components/layout/ModuleSidebar'
import TopBar from '@/components/layout/TopBar'
import DeviceAlertBanner from '@/components/layout/DeviceAlertBanner'
import MobileBottomNav from '@/components/layout/MobileBottomNav'
import HelpButton from '@/components/HelpButton'

const MODULE_MAP: Array<[string[], string]> = [
  [['/asistencia', '/sync', '/permisos', '/aprobaciones'], 'asistencia'],
  [['/empleados', '/cargos', '/departamentos', '/evaluaciones', '/onboarding'], 'personas'],
  [['/nomina'], 'nomina'],
  [['/bancos', '/pagos'], 'pagos'],
  [['/documentos'], 'documentos'],
  [['/seguridad', '/usuarios'], 'seguridad'],
  [['/configuracion', '/notificaciones-config', '/sistema'], 'configuracion'],
  [['/auditoria'], 'auditoria'],
  [['/competencias'], 'competencias'],
  [['/cumplimiento'], 'cumplimiento'],
  [['/reportes'], 'reportes'],
]

function getModuleKey(pathname: string): string | null {
  if (pathname === '/portal' || pathname.startsWith('/portal/') ||
      pathname === '/mi-portal' || pathname.startsWith('/mi-portal/')) {
    return null
  }
  for (const [paths, key] of MODULE_MAP) {
    if (paths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
      return key
    }
  }
  return 'full'
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const moduleKey = getModuleKey(pathname)

  return (
    <div className="flex min-h-screen bg-slate-50">
      {moduleKey === null && (
        <main className="flex-1 overflow-auto flex flex-col pb-20 md:pb-0">
          <TopBar />
          <div className="flex-1">{children}</div>
        </main>
      )}
      {moduleKey === 'full' && (
        <>
          <Sidebar />
          <main className="flex-1 overflow-auto flex flex-col pb-20 md:pb-0">
            <TopBar />
            <div className="flex-1">{children}</div>
          </main>
        </>
      )}
      {moduleKey && moduleKey !== 'full' && (
        <>
          <ModuleSidebar moduleKey={moduleKey} />
          <main className="flex-1 overflow-auto flex flex-col pb-20 md:pb-0">
            <TopBar />
            <div className="flex-1">{children}</div>
          </main>
        </>
      )}
      <DeviceAlertBanner />
      <MobileBottomNav />
      <HelpButton />
    </div>
  )
}
