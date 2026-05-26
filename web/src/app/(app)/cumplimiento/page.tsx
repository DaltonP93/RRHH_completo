'use client'
import { useState, useEffect } from 'react'
import { Scale, AlertTriangle, Clock, Users, FileText, Shield, Calendar, Upload, UserPlus, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

interface Presentation {
  id: number
  tipo: string
  periodo: string
  estado: string
  fecha_envio?: string
  acuse?: string
}

interface KPIs {
  presentaciones_pendientes: number
  vencimientos_mes: number
  alertas_activas: number
  empleados_ips: number
}

const PRESENTATION_TYPE_LABELS: Record<string, string> = {
  ALTA: 'Alta Personal', BAJA: 'Baja Personal', VACACIONES: 'Vacaciones',
  PERMISO: 'Permiso', SUSPENSION: 'Suspensión', ACCIDENTE: 'Accidente Laboral',
  LIQUIDACION: 'Liquidación', AGUINALDO: 'Aguinaldo', PLANILLA_ANUAL: 'Planilla Anual', AMONESTACION: 'Amonestación'
}

const QUICK_ACCESS = [
  {
    icon: FileText,
    iconColor: 'bg-blue-600',
    title: 'MTESS / REOP',
    description: 'Presentaciones electrónicas al Ministerio de Trabajo, Empleo y Seguridad Social',
    href: '/cumplimiento/mtess',
  },
  {
    icon: Shield,
    iconColor: 'bg-teal-600',
    title: 'IPS / REI',
    description: 'Registro de empleados en IPS y gestión de aportes patronales y personales',
    href: '/cumplimiento/ips',
  },
  {
    icon: Scale,
    iconColor: 'bg-purple-600',
    title: 'Planillas Laborales',
    description: 'Planillas anuales de empleados, sueldos y jornales ante el MTESS',
    href: '/cumplimiento/mtess',
  },
  {
    icon: Calendar,
    iconColor: 'bg-amber-600',
    title: 'Vencimientos',
    description: 'Calendario de fechas límite de obligaciones MTESS e IPS',
    href: '/cumplimiento/vencimientos',
  },
  {
    icon: UserPlus,
    iconColor: 'bg-emerald-600',
    title: 'Altas / Bajas',
    description: 'Gestión de comunicaciones de altas y bajas de personal ante MTESS e IPS',
    href: '/cumplimiento/mtess',
  },
  {
    icon: Upload,
    iconColor: 'bg-slate-600',
    title: 'Exportaciones',
    description: 'Generación de archivos para presentación ante organismos reguladores',
    href: '/cumplimiento/mtess',
  },
]

export default function CumplimientoPage() {
  const [presentations, setPresentations] = useState<Presentation[]>([])
  const [kpis, setKpis] = useState<KPIs>({ presentaciones_pendientes: 0, vencimientos_mes: 0, alertas_activas: 0, empleados_ips: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/api/compliance').then(r => {
        const d = r.data
        return Array.isArray(d) ? d : (Array.isArray(d?.presentations) ? d.presentations : (Array.isArray(d?.data) ? d.data : []))
      }).catch(() => [] as Presentation[]),
      api.get('/api/compliance/status').then(r => r.data).catch(() => null),
    ]).then(([pres, status]) => {
      setPresentations(pres as Presentation[])
      if (status) {
        setKpis({
          presentaciones_pendientes: status.presentaciones_pendientes ?? (pres as Presentation[]).filter((p: Presentation) => p.estado === 'pending').length,
          vencimientos_mes: status.vencimientos_mes ?? 0,
          alertas_activas: status.alertas_activas ?? 0,
          empleados_ips: status.empleados_ips ?? 0,
        })
      } else {
        const pending = (pres as Presentation[]).filter((p: Presentation) => p.estado === 'pending').length
        setKpis(k => ({ ...k, presentaciones_pendientes: pending }))
      }
    }).finally(() => setLoading(false))
  }, [])

  const KPI_CARDS = [
    { label: 'Presentaciones pendientes', value: kpis.presentaciones_pendientes, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200' },
    { label: 'Vencimientos este mes', value: kpis.vencimientos_mes, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-200' },
    { label: 'Alertas activas', value: kpis.alertas_activas, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', ring: 'ring-orange-200' },
    { label: 'Empleados IPS activos', value: kpis.empleados_ips, icon: Users, color: 'text-teal-600', bg: 'bg-teal-50', ring: 'ring-teal-200' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <EnterprisePageHeader
        icon={Scale}
        iconColor="bg-slate-700"
        title="Cumplimiento Legal"
        subtitle="MTESS/REOP, IPS/REI y obligaciones laborales Paraguay"
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Cumplimiento Legal' }]}
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`rounded-xl border ring-1 ${card.ring} ${card.bg} px-5 py-4 flex items-center gap-4`}>
              <div className={`w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
                <Icon size={18} className={card.color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{loading ? '—' : card.value}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">{card.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick Access Grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Acceso rápido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_ACCESS.map(card => {
            const Icon = card.icon
            return (
              <Link
                key={card.href + card.title}
                href={card.href}
                className="group bg-white border border-slate-100 hover:border-slate-300 rounded-xl p-5 flex items-start gap-4 transition-all hover:shadow-sm"
              >
                <div className={`w-10 h-10 rounded-lg ${card.iconColor} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">{card.title}</p>
                    <ArrowRight size={13} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{card.description}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Recent Presentations Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Presentaciones recientes</h2>
          <Link href="/cumplimiento/mtess" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Ver todas →</Link>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-slate-300" size={24} />
            </div>
          ) : presentations.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin presentaciones registradas"
              description="Las presentaciones MTESS e IPS aparecerán aquí cuando sean generadas."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha envío</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Acuse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {presentations.slice(0, 10).map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                        {PRESENTATION_TYPE_LABELS[item.tipo] ?? item.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.periodo ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.estado} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {item.fecha_envio ? new Date(item.fecha_envio).toLocaleDateString('es-PY') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.acuse ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
