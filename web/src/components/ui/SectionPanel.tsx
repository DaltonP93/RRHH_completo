interface Props {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
  noPad?: boolean
  className?: string
}

export default function SectionPanel({ title, subtitle, actions, children, noPad, className = '' }: Props) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPad ? '' : 'p-4'}>
        {children}
      </div>
    </div>
  )
}
