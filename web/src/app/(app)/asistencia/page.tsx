'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock, Search, Filter, Plus, Download, RefreshCw } from 'lucide-react'
import { attendanceApi, employeesApi } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { api } from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────
interface AttendanceRow {
  id: number
  employee_id: number
  employee_name: string
  code: string
  department: string
  photo_url?: string
  date: string
  first_in: string | null
  last_out: string | null
  worked_minutes: number
  late_minutes: number
  overtime_minutes: number
  status: 'present' | 'absent' | 'late' | 'permission' | 'holiday' | 'weekend'
  scheduled_in: string
  scheduled_out: string
}

interface LiveLog {
  employeeId: number
  employeeName: string
  timestamp: string
  type: 'in' | 'out' | 'unknown'
  source: 'device' | 'mobile' | 'manual'
}

// ─── Helpers ──────────────────────────────────────────────────────
function minsToHM(mins: number | null) {
  if (!mins || mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function fmtTime(dt: string | null) {
  if (!dt) return '—'
  try { return format(new Date(dt), 'HH:mm') } catch { return '—' }
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  present:    { label: 'Presente',  cls: 'bg-green-50  text-green-700'  },
  late:       { label: 'Retardo',   cls: 'bg-amber-50  text-amber-700'  },
  absent:     { label: 'Ausente',   cls: 'bg-red-50    text-red-700'    },
  permission: { label: 'Permiso',   cls: 'bg-purple-50 text-purple-700' },
  holiday:    { label: 'Festivo',   cls: 'bg-blue-50   text-blue-700'   },
  weekend:    { label: 'Fin de semana', cls: 'bg-slate-50 text-slate-500' },
}

const SOURCE_ICON: Record<string, string> = {
  device: '🖐️', mobile: '📱', manual: '✏️',
}

// ─── Modal marcaje manual ─────────────────────────────────────────
function ManualCheckinModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [timestamp, setTimestamp]   = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [type, setType]             = useState<'in' | 'out'>('in')
  const [saving, setSaving]         = useState(false)

  const { data } = useQuery({
    queryKey: ['employees-select'],
    queryFn: () => employeesApi.list({ limit: 500, status: 'active' }),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await attendanceApi.registerManual({ employeeId: +employeeId, timestamp, type })
      onSaved()
      onClose()
    } catch {
      alert('Error al registrar marcaje')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-5">Marcaje Manual</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empleado</label>
            <select
              required
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar...</option>
              {(data?.data || []).map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  [{emp.code}] {emp.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha y hora</label>
            <input
              type="datetime-local"
              required
              value={timestamp}
              onChange={e => setTimestamp(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
            <div className="flex gap-3">
              {(['in', 'out'] as const).map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{t === 'in' ? 'Entrada' : 'Salida'}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export default function AsistenciaPage() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [date, setDate]         = useState(today)
  const [search, setSearch]     = useState('')
  const [dept, setDept]         = useState('')
  const [showModal, setModal]   = useState(false)
  const [liveTop, setLiveTop]   = useState<LiveLog[]>([])

  // Departamentos para filtro
  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/api/employees/departments').then(r => ({ data: r.data })),
    staleTime: 300_000,
  })

  // Datos de asistencia del día
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['attendance-by-date', date, dept],
    queryFn: () => attendanceApi.byDate({ date, dept: dept || undefined, limit: 200 }),
    staleTime: 30_000,
  })

  // Socket.io — actualizar en tiempo real cuando llega un marcaje
  useEffect(() => {
    const socket = getSocket()
    socket.on('attendance:new', (event: LiveLog) => {
      setLiveTop(prev => [event, ...prev].slice(0, 5))
      if (date === today) refetch()
    })
    return () => { socket.off('attendance:new') }
  }, [date, today, refetch])

  const rows: AttendanceRow[] = (data || [])
  const filtered = rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.employee_name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q)
  })

  // Stats rápidas
  const present  = filtered.filter(r => r.status === 'present').length
  const late     = filtered.filter(r => r.status === 'late').length
  const absent   = filtered.filter(r => r.status === 'absent').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="text-blue-600" size={26} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Asistencia</h1>
            <p className="text-sm text-slate-500 capitalize">
              {format(new Date(date + 'T12:00'), "EEEE d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-3 py-2.5 rounded-xl text-sm hover:bg-slate-50"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={15} /> Marcaje manual
          </button>
        </div>
      </div>

      {/* Alertas en vivo */}
      {liveTop.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 flex gap-4 items-center overflow-x-auto">
          <span className="text-blue-600 font-semibold text-xs whitespace-nowrap">En vivo:</span>
          {liveTop.map((log, i) => (
            <div key={i} className="flex items-center gap-2 text-sm whitespace-nowrap">
              <span>{SOURCE_ICON[log.source] || '🖐️'}</span>
              <span className="text-slate-700 font-medium">{log.employeeName}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                log.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {log.type === 'in' ? 'Entrada' : 'Salida'}
              </span>
              <span className="text-slate-400 text-xs">{fmtTime(log.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Presentes</p>
          <p className="text-3xl font-bold text-green-700">{present + late}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Retardos</p>
          <p className="text-3xl font-bold text-amber-700">{late}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Ausentes</p>
          <p className="text-3xl font-bold text-red-700">{absent}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-slate-100 shadow-sm rounded-2xl px-5 py-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={today}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Departamento</label>
          <select
            value={dept}
            onChange={e => setDept(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {(deptsData?.data || []).map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">Buscar</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nombre o código..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">Cargando marcaciones...</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Empleado</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Departamento</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Entrada</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Salida</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Trabajado</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Retardo</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Horario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((row, i) => {
                const cfg = STATUS_CFG[row.status] || STATUS_CFG.absent
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs shrink-0">
                          {row.employee_name?.split(' ').slice(0,2).map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{row.employee_name}</p>
                          <p className="text-xs text-slate-400 font-mono">{row.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{row.department || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">
                      {fmtTime(row.first_in)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">
                      {fmtTime(row.last_out)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">
                      {minsToHM(row.worked_minutes)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.late_minutes > 0 ? (
                        <span className="text-amber-600 font-semibold">{row.late_minutes} min</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400 font-mono text-xs">
                      {row.scheduled_in?.slice(0,5)} – {row.scheduled_out?.slice(0,5)}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-slate-400">
                    Sin registros para este día
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">{filtered.length} empleados mostrados</p>

      {showModal && (
        <ManualCheckinModal
          onClose={() => setModal(false)}
          onSaved={() => refetch()}
        />
      )}
    </div>
  )
}
