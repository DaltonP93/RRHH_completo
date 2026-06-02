'use client'
import { useState, useEffect } from 'react'
import { Settings, Pencil, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'

interface Params {
  salario_minimo_diario?: number
  salario_minimo_mensual?: number
  salario_vigente_desde?: string
  ips_empleado?: number
  ips_patronal?: number
  [key: string]: unknown
}

interface ParamRowProps {
  label: string
  value: string
}

function ParamRow({ label, value }: ParamRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800">{value}</span>
    </div>
  )
}

interface SectionCardProps {
  title: string
  children: React.ReactNode
}

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{title}</span>
        <button
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
          title="Editar sección"
        >
          <Pencil size={12} />
          Editar
        </button>
      </div>
      <div className="px-4 py-1">
        {children}
      </div>
    </div>
  )
}

function fmtGs(n?: number) {
  if (n == null) return '—'
  return 'Gs. ' + n.toLocaleString('es-PY')
}

export default function ParametrosPage() {
  const [params, setParams] = useState<Params>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.any([
      api.get('/api/payroll-params').then(r => r.data),
      api.get('/api/payroll-parameters').then(r => r.data),
    ])
      .then(d => setParams((d && typeof d === 'object' && !Array.isArray(d)) ? d : {}))
      .catch(() => setParams({}))
      .finally(() => setLoading(false))
  }, [])

  const smd    = (params.salario_minimo_diario  as number | undefined) ?? 65283
  const smm    = (params.salario_minimo_mensual as number | undefined) ?? 2550307
  const vDesde = (params.salario_vigente_desde  as string | undefined) ?? '2025-01-01'
  const ipsEmp = (params.ips_empleado           as number | undefined) ?? 9
  const ipsPat = (params.ips_patronal           as number | undefined) ?? 16.5

  return (
    <div className="p-6 space-y-5">
      <EnterprisePageHeader
        icon={Settings}
        iconColor="bg-slate-700"
        title="Parámetros Mensuales"
        subtitle="Configuración de tasas y valores para la liquidación del período"
        breadcrumbs={[
          { label: 'Nómina', href: '/nomina' },
          { label: 'Parámetros' },
        ]}
        actions={
          <button
            disabled
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-300 text-slate-500 text-xs font-medium rounded-lg cursor-not-allowed"
            title="Próximamente"
          >
            <Settings size={14} />
            Configurar período
          </button>
        }
      />

      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <Calendar size={14} className="text-slate-500" />
        <span className="text-xs text-slate-600">
          <span className="font-semibold">Período activo:</span> Mayo 2026
        </span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Cargando parámetros...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SectionCard title="Salario Mínimo Legal">
            <ParamRow label="Salario mínimo diario"  value={fmtGs(smd)} />
            <ParamRow label="Salario mínimo mensual" value={fmtGs(smm)} />
            <ParamRow label="Vigente desde"          value={vDesde} />
          </SectionCard>

          <SectionCard title="IPS — Instituto de Previsión Social">
            <ParamRow label="Aporte empleado (obrero)" value={`${ipsEmp}%`} />
            <ParamRow label="Aporte patronal"          value={`${ipsPat}%`} />
            <ParamRow label="Aguinaldo"                value="No aporta IPS" />
          </SectionCard>

          <SectionCard title="Aguinaldo">
            <ParamRow label="Tasa"    value="1/12 del salario anual" />
            <ParamRow label="Período" value="Enero a diciembre" />
          </SectionCard>

          <SectionCard title="Preaviso Legal">
            <ParamRow label="Menos de 1 año" value="No corresponde" />
            <ParamRow label="1 a 5 años"     value="30 días" />
            <ParamRow label="Más de 5 años"  value="45 días" />
          </SectionCard>
        </div>
      )}
    </div>
  )
}
