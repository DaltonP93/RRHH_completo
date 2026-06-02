import { AlertCircle, Clock, CheckCircle, XCircle, AlertTriangle, Archive } from 'lucide-react'

const CONFIGS: Record<string, { label: string; cls: string; dot: string; icon?: React.ElementType }> = {
  // Generic states
  active:     { label: 'Activo',      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',  dot: 'bg-emerald-500' },
  inactive:   { label: 'Inactivo',    cls: 'bg-slate-100 text-slate-500 ring-slate-200',       dot: 'bg-slate-400' },
  pending:    { label: 'Pendiente',   cls: 'bg-amber-50 text-amber-700 ring-amber-200',        dot: 'bg-amber-500', icon: Clock },
  approved:   { label: 'Aprobado',    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',  dot: 'bg-emerald-500', icon: CheckCircle },
  rejected:   { label: 'Rechazado',   cls: 'bg-red-50 text-red-700 ring-red-200',              dot: 'bg-red-500', icon: XCircle },
  error:      { label: 'Con errores', cls: 'bg-red-50 text-red-700 ring-red-200',              dot: 'bg-red-500', icon: AlertCircle },
  draft:      { label: 'Borrador',    cls: 'bg-slate-100 text-slate-600 ring-slate-200',       dot: 'bg-slate-400' },
  // Compliance states
  generated:  { label: 'Generado',    cls: 'bg-blue-50 text-blue-700 ring-blue-200',           dot: 'bg-blue-500' },
  submitted:  { label: 'Enviado',     cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200',     dot: 'bg-indigo-500' },
  accepted:   { label: 'Aceptado',    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',  dot: 'bg-emerald-500', icon: CheckCircle },
  observed:   { label: 'Observado',   cls: 'bg-orange-50 text-orange-700 ring-orange-200',     dot: 'bg-orange-500', icon: AlertTriangle },
  corrected:  { label: 'Corregido',   cls: 'bg-teal-50 text-teal-700 ring-teal-200',           dot: 'bg-teal-500' },
  archived:   { label: 'Archivado',   cls: 'bg-slate-100 text-slate-500 ring-slate-200',       dot: 'bg-slate-400', icon: Archive },
  // Module states
  available:        { label: 'Disponible',        cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  in_progress:      { label: 'En configuración',  cls: 'bg-amber-50 text-amber-700 ring-amber-200',      dot: 'bg-amber-500' },
  pending_migration:{ label: 'Pendiente',          cls: 'bg-orange-50 text-orange-700 ring-orange-200',   dot: 'bg-orange-500' },
  disabled:         { label: 'Deshabilitado',      cls: 'bg-slate-100 text-slate-400 ring-slate-200',     dot: 'bg-slate-300' },
}

interface Props {
  status: string
  label?: string
  showDot?: boolean
  showIcon?: boolean
  size?: 'xs' | 'sm'
}

export default function StatusBadge({ status, label, showDot = true, showIcon = false, size = 'xs' }: Props) {
  const cfg = CONFIGS[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' }
  const Icon = cfg.icon
  const text = label ?? cfg.label
  const px = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'

  return (
    <span className={`inline-flex items-center gap-1.5 ${px} rounded-full font-medium ring-1 ${cfg.cls}`}>
      {showIcon && Icon
        ? <Icon size={10} />
        : showDot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      }
      {text}
    </span>
  )
}
