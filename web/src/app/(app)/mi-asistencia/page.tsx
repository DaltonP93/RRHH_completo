'use client'
import { useEffect, useState } from 'react'
import { Clock, Calendar, TrendingUp, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface Log { id: number; timestamp: string; type: 'in' | 'out'; source: string | null; device_id: number | null }
interface Summary {
  date: string
  first_in: string | null; last_out: string | null
  worked_minutes: number; late_minutes: number
  status: 'present' | 'absent' | 'late' | 'partial' | string
}

function todayISO()     { return new Date().toISOString().slice(0, 10) }
function nDaysAgoISO(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function fmtMins(m: number) {
  const h = Math.floor(m / 60), mm = m % 60
  return `${h}h ${mm.toString().padStart(2, '0')}m`
}

const STATUS_COLOR: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-800',
  late:    'bg-amber-100 text-amber-800',
  partial: 'bg-blue-100 text-blue-800',
  absent:  'bg-red-100 text-red-800',
}

export default function MiAsistenciaPage() {
  const [from, setFrom] = useState(nDaysAgoISO(14))
  const [to, setTo]     = useState(todayISO())
  const [logs, setLogs] = useState<Log[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [a, s] = await Promise.all([
        api.get('/api/me/attendance', { params: { from, to } }).then(r => r.data as Log[]),
        api.get('/api/me/summary',    { params: { from, to } }).then(r => r.data as Summary[]),
      ])
      setLogs(a); setSummary(s)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [from, to])

  const totalWorked = summary.reduce((acc, d) => acc + (d.worked_minutes || 0), 0)
  const totalLate   = summary.reduce((acc, d) => acc + (d.late_minutes || 0), 0)
  const presentDays = summary.filter(d => ['present','late','partial'].includes(d.status)).length

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center">
          <Clock className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi asistencia</h1>
          <p className="text-slate-500 text-sm">Tus marcajes y resumen diario.</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => { setFrom(todayISO()); setTo(todayISO()) }}
            className="px-3 py-2 text-xs rounded-xl bg-slate-100 hover:bg-slate-200">Hoy</button>
          <button onClick={() => { setFrom(nDaysAgoISO(7)); setTo(todayISO()) }}
            className="px-3 py-2 text-xs rounded-xl bg-slate-100 hover:bg-slate-200">7 días</button>
          <button onClick={() => { setFrom(nDaysAgoISO(30)); setTo(todayISO()) }}
            className="px-3 py-2 text-xs rounded-xl bg-slate-100 hover:bg-slate-200">30 días</button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-red-900">{error}</div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi label="Días presentes" value={`${presentDays}`} icon={Calendar} color="bg-emerald-500" />
        <Kpi label="Horas trabajadas" value={fmtMins(totalWorked)} icon={Clock} color="bg-blue-500" />
        <Kpi label="Atrasos" value={fmtMins(totalLate)} icon={TrendingUp} color="bg-amber-500" />
      </div>

      {/* Resumen diario */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-900 text-sm">Resumen diario</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando...</div>
        ) : summary.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Sin datos en el rango.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Entrada</th>
                <th className="px-4 py-3">Salida</th>
                <th className="px-4 py-3">Trabajado</th>
                <th className="px-4 py-3">Atraso</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map(d => (
                <tr key={d.date}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{d.date}</td>
                  <td className="px-4 py-2.5 text-slate-600">{d.first_in || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{d.last_out || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtMins(d.worked_minutes || 0)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{d.late_minutes ? fmtMins(d.late_minutes) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[d.status] || 'bg-slate-100 text-slate-600'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Marcajes crudos */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-900 text-sm">Marcajes ({logs.length})</h2>
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Sin marcajes.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Fecha / Hora</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 text-slate-900">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${l.type === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                      {l.type === 'in' ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{l.source || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
        <Icon className="text-white" size={22} />
      </div>
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  )
}
