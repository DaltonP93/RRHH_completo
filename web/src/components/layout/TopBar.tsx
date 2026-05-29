'use client'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import LanguageSwitcher from './LanguageSwitcher'

export default function TopBar() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-4 h-10 bg-white border-b border-slate-200 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <GlobalSearch />
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationBell />
      </div>
    </div>
  )
}
