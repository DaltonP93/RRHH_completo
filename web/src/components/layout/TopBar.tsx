'use client'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import LanguageSwitcher from './LanguageSwitcher'

export default function TopBar() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-4 h-12 bg-white/80 backdrop-blur border-b border-slate-100">
      <GlobalSearch />
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationBell />
      </div>
    </div>
  )
}
