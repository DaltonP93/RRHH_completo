import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Metric {
  label: string
  value: string | number
  icon?: LucideIcon
  iconColor?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  highlight?: boolean
}

interface Props {
  metrics: Metric[]
}

export default function MetricStrip({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      {metrics.map((m, i) => {
        const Icon = m.icon
        const TrendIcon = m.trend === 'up' ? TrendingUp : m.trend === 'down' ? TrendingDown : Minus
        const trendColor = m.trend === 'up' ? 'text-emerald-600' : m.trend === 'down' ? 'text-red-500' : 'text-slate-400'
        return (
          <div key={i} className={`bg-white px-3 py-2.5 flex items-center gap-2.5 ${m.highlight ? 'bg-slate-50' : ''}`}>
            {Icon && (
              <div className={`w-7 h-7 rounded-md ${m.iconColor ?? 'bg-slate-100'} flex items-center justify-center flex-shrink-0`}>
                <Icon size={13} className="text-white" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold truncate">{m.label}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-slate-800 leading-tight tabular-nums">{m.value}</span>
                {m.trend && m.trendValue && (
                  <span className={`flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
                    <TrendIcon size={9} />
                    {m.trendValue}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
