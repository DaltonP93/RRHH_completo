'use client'

import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { api } from '@/lib/api'

interface Param { key: string; value: string; label: string }

const DEFAULTS: Param[] = [
  { key: 'sml', value: 'Gs. 2.550.307', label: 'Salario Mínimo Legal (SML)' },
  { key: 'ips_employee', value: '9%', label: 'Aporte IPS empleado' },
  { key: 'ips_employer', value: '16.5%', label: 'Aporte IPS patronal' },
  { key: 'tolerance_late', value: '10 minutos', label: 'Tolerancia de atrasos' },
  { key: 'notify_email', value: 'No configurado', label: 'Email notificaciones' },
]

function Section({ title, items }: { title: string; items: Param[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map(p => (
          <div key={p.key} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-slate-600">{p.label}</span>
            <span className="text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-0.5">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ParametrosPage() {
  const [params, setParams] = useState<Param[]>(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/settings')
      .then(r => { if (Array.isArray(r.data) && r.data.length) setParams(r.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const nomina = params.filter(p => ['sml', 'ips_employee', 'ips_employer'].includes(p.key))
  const asistencia = params.filter(p => ['tolerance_late'].includes(p.key))
  const notif = params.filter(p => ['notify_email'].includes(p.key))

  if (loading) return (
    <div className="p-6 space-y-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-500" />
          Parámetros Generales
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Configuración global del sistema RRHH</p>
      </div>
      <Section title="Nómina" items={nomina.length ? nomina : DEFAULTS.slice(0, 3)} />
      <Section title="Asistencia" items={asistencia.length ? asistencia : DEFAULTS.slice(3, 4)} />
      <Section title="Notificaciones" items={notif.length ? notif : DEFAULTS.slice(4)} />
    </div>
  )
}
