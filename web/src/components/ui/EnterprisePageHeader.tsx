import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

interface Crumb { label: string; href?: string }

interface Props {
  icon?: LucideIcon
  iconColor?: string
  title: string
  subtitle?: string
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
  meta?: React.ReactNode
}

export default function EnterprisePageHeader({ icon: Icon, iconColor = 'bg-slate-700', title, subtitle, breadcrumbs, actions, meta }: Props) {
  return (
    <div className="mb-5">
      {/* Breadcrumb */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-slate-400 mb-3">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} className="text-slate-300" />}
              {crumb.href
                ? <Link href={crumb.href} className="hover:text-slate-600 transition-colors">{crumb.label}</Link>
                : <span className="text-slate-500 font-medium">{crumb.label}</span>
              }
            </span>
          ))}
        </nav>
      )}

      {/* Main header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`w-9 h-9 rounded-lg ${iconColor} flex items-center justify-center flex-shrink-0`}>
              <Icon size={16} className="text-white" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            {meta && <div className="mt-1">{meta}</div>}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
