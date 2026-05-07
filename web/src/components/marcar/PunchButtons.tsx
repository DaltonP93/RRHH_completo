'use client'
import { LogIn, LogOut, Loader2 } from 'lucide-react'

interface Props {
  onPunch:    (type: 'in' | 'out') => void
  loading?:   boolean
  disabled?:  boolean
  disabledReason?: string
}

/**
 * Botones grandes ENTRADA / SALIDA. Diseñados para tap-target ≥ 60px,
 * cumpliendo WCAG 2.5.5 (44×44 mínimo) y mobile-first.
 */
export default function PunchButtons({ onPunch, loading, disabled, disabledReason }: Props) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onPunch('in')}
          disabled={disabled || loading}
          aria-label="Marcar entrada"
          className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-2xl
                     bg-gradient-to-br from-emerald-500 to-emerald-600
                     hover:from-emerald-600 hover:to-emerald-700
                     active:scale-[0.98]
                     disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed
                     text-white font-bold text-lg shadow-lg shadow-emerald-500/30
                     transition-all">
          {loading
            ? <Loader2 className="animate-spin" size={28} />
            : <LogIn size={28} />}
          <span>ENTRADA</span>
        </button>
        <button
          onClick={() => onPunch('out')}
          disabled={disabled || loading}
          aria-label="Marcar salida"
          className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-2xl
                     bg-gradient-to-br from-rose-500 to-rose-600
                     hover:from-rose-600 hover:to-rose-700
                     active:scale-[0.98]
                     disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed
                     text-white font-bold text-lg shadow-lg shadow-rose-500/30
                     transition-all">
          {loading
            ? <Loader2 className="animate-spin" size={28} />
            : <LogOut size={28} />}
          <span>SALIDA</span>
        </button>
      </div>
      {disabled && disabledReason && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
          {disabledReason}
        </p>
      )}
    </div>
  )
}
