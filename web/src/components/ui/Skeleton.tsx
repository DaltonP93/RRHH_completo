interface Props {
  rows?: number
  cols?: number
  className?: string
}

function SkeletonLine({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded bg-slate-100 animate-pulse`} />
}

export function SkeletonTable({ rows = 5, cols = 4 }: Props) {
  return (
    <div className="divide-y divide-slate-50">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} w={c === 0 ? 'w-32' : 'flex-1'} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonLine w="w-32" h="h-3" />
          <SkeletonLine w="w-20" h="h-2" />
        </div>
      </div>
      <SkeletonLine h="h-2" />
      <SkeletonLine w="w-3/4" h="h-2" />
    </div>
  )
}

export default function Skeleton({ rows = 3, className }: Props) {
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} w={i % 3 === 2 ? 'w-3/4' : 'w-full'} />
      ))}
    </div>
  )
}
