'use client'
import NotificationBell from './NotificationBell'

export default function TopBar() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-end gap-2 px-4 h-12 bg-white/80 backdrop-blur border-b border-slate-100">
      <NotificationBell />
    </div>
  )
}
