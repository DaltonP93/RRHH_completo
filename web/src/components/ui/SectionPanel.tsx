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
    <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <div>
            {title && <h3 className="text-xs font-semibold text-slate-700">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
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
