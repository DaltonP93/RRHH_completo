'use client'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import LanguageSwitcher from './LanguageSwitcher'

export default function TopBar() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-4 h-10 bg-white/90 backdrop-blur border-b border-slate-200">
      <GlobalSearch />
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationBell />
      </div>
    </div>
  )
}
