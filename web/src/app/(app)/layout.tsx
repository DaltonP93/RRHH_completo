import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import DeviceAlertBanner from '@/components/layout/DeviceAlertBanner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <TopBar />
        <div className="flex-1">{children}</div>
      </main>
      <DeviceAlertBanner />
    </div>
  )
}
