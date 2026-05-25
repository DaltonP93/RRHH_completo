'use client'
import { useEffect, useState } from 'react'
import {
  Users, UserCheck, Clock, AlertTriangle, TrendingUp, Building2,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface EmbedData {
  generated_at: string
  scope: { widgets: string[]; deptId: number | null; name: string }
  kpis?: any
  trend?: any[]
  byDept?: any[]
}

interface EmbedPageProps {
  params: Promise<{ token: string }>
}

export default function EmbedPage({ params }: { params: { token: string } }) {
  return <EmbedPageContent params={params} />
}

function EmbedPageContent({ params }: { params: { token: string } }) {
  const [data, setData] = useState<EmbedData | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const r = await fetch(`/api/embed/data/${params.token}`)
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.error || 'No se pudo cargar')
      }
      setData(await r.json())
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Error')
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // refrescar cada minuto
    return () => clearInterval(t)
  }, [params.token])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white border border-rose-200 rounded-xl p-6 max-w-sm text-center">
          <AlertTriangle className="text-rose-500 mx-auto mb-3" size={32} />
          <p className="font-bold text-slate-900">Embed no disponible</p>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        Cargando...
      </div>
    )
  }

  const widgets = data.scope.widgets || []
  const k = data.kpis || {}
  const present = Number(k.present || 0) + Number(k.late_count || 0)
  const total   = Number(k.total_employees || 0)
  const rate    = total > 0 ? Math.round((present / total) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{data.scope.name}</h1>
          <p className="text-[11px] text-slate-400">
            Actualizado: {new Date(data.generated_at).toLocaleString('es-PY')}
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 font-medium">
          read-only · embed
        </span>
      </div>

      {widgets.includes('kpis') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Users size={12} /> Total
            </div>
            <p className="text-2xl font-bold text-slate-900">{total}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs text-emerald-600 mb-1">
              <UserCheck size={12} /> Presentes
            </div>
            <p className="text-2xl font-bold text-emerald-700">{present}</p>
            <p className="text-[10px] text-emerald-500 mt-0.5">{rate}% asistencia</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs text-amber-600 mb-1">
              <Clock size={12} /> Atrasos
            </div>
            <p className="text-2xl font-bold text-amber-700">{k.late_count || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs text-rose-600 mb-1">
              <AlertTriangle size={12} /> Ausentes
            </div>
            <p className="text-2xl font-bold text-rose-700">{k.absent || 0}</p>
          </div>
        </div>
      )}

      {widgets.includes('trend') && data.trend && data.trend.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <TrendingUp size={14} /> Tendencia 7 días
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10}
                tickFormatter={(d) => new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })} />
              <YAxis stroke="#94a3b8" fontSize={10} />
              <Tooltip />
              <Line type="monotone" dataKey="present" name="Presentes" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="absent"  name="Ausentes"  stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {widgets.includes('byDept') && data.byDept && data.byDept.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Building2 size={14} /> Por departamento (hoy)
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(160, 30 * data.byDept.length)}>
            <BarChart data={data.byDept} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" stroke="#94a3b8" fontSize={10} />
              <YAxis type="category" dataKey="department" stroke="#94a3b8" fontSize={10} width={80} />
              <Tooltip />
              <Bar dataKey="present" name="Presentes" fill="#10b981" />
              <Bar dataKey="absent"  name="Ausentes"  fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
