'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Calendar, Plane, Stethoscope, Heart, Baby, Users as UsersIcon, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { useI18n } from '@/i18n/I18nProvider'

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const TYPE_COLORS: Record<string, string> = {
  vacation:   'bg-blue-500',
  sick:       'bg-rose-500',
  personal:   'bg-amber-500',
  maternity:  'bg-pink-500',
  paternity:  'bg-cyan-500',
  other:      'bg-slate-400',
}
const TYPE_ICONS: Record<string, any> = {
  vacation: Plane, sick: Stethoscope, personal: Heart,
  maternity: Baby, paternity: Baby, other: UsersIcon,
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function dateInRange(dateStr: string, from: string, to: string) {
  return dateStr >= from && dateStr <= to
}

export default function VacacionesPage() {
  const { t } = useI18n()
  const now = new Date()
  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [deptId, setDeptId] = useState('')

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/api/employees/departments').then(r => r.data),
    staleTime: 300_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['vacation-plan', year, month, deptId],
    queryFn: () => api.get('/api/vacations/plan', { params: { year, month, deptId: deptId || undefined } }).then(r => r.data),
  })

  const numDays = daysInMonth(year, month)
  const days = Array.from({ length: numDays }, (_, i) => i + 1)
  const employees: any[] = data?.employees || []
  const holidays: any[] = data?.holidays || []
  const holidaySet = useMemo(() => new Set((holidays || []).map((h: any) => h.date.slice(0, 10))), [holidays])

  function changeMonth(delta: number) {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    setMonth(m); setYear(y)
  }

  function dayOfWeek(d: number) {
    return new Date(year, month - 1, d).getDay() // 0 = Domingo
  }

  // Detección de conflictos (>3 personas mismo día mismo depto)
  const conflicts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const emp of employees) {
      for (const r of emp.ranges) {
        const from = String(r.date_from).slice(0, 10)
        const to   = String(r.date_to).slice(0, 10)
        for (let d = 1; d <= numDays; d++) {
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          if (dateInRange(dateStr, from, to)) map[dateStr] = (map[dateStr] || 0) + 1
        }
      }
    }
    return map
  }, [employees, numDays, year, month])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
          <Plane className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plan de Vacaciones</h1>
          <p className="text-sm text-slate-500">Vista mensual de permisos y vacaciones aprobados/pendientes</p>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft size={18} />
          </button>
          <select value={month} onChange={e => setMonth(+e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold min-w-[140px]">
            {MESES_ES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => changeMonth(1)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="border-l border-slate-200 pl-3">
          <select value={deptId} onChange={e => setDeptId(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">{t('common.all')} {t('employees.department').toLowerCase()}</option>
            {(deptsData || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {Object.entries(TYPE_COLORS).map(([type, cls]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${cls}`} />
              <span className="text-slate-600 capitalize">{type === 'vacation' ? 'Vacación' : type === 'sick' ? 'Enferm.' : type === 'personal' ? 'Personal' : type === 'maternity' ? 'Mater.' : type === 'paternity' ? 'Pater.' : 'Otro'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendario tipo Gantt */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Cargando...</div>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-slate-400">
          <Calendar size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin permisos en {MESES_ES[month - 1]} {year}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 sticky left-0 bg-white z-10 min-w-[200px]">
                  Empleado
                </th>
                {days.map(d => {
                  const dow = dayOfWeek(d)
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                  const isWeekend = dow === 0 || dow === 6
                  const isHoliday = holidaySet.has(dateStr)
                  const c = conflicts[dateStr] || 0
                  return (
                    <th key={d} className={`text-center px-1 py-2.5 font-medium w-[26px] ${
                      isHoliday ? 'bg-red-50 text-red-600' :
                      isWeekend ? 'bg-slate-50 text-slate-400' : 'text-slate-500'
                    }`}>
                      <div>{d}</div>
                      {c >= 3 && (
                        <div className="text-[9px] text-rose-600 font-bold mt-0.5" title={`${c} personas`}>
                          ⚠
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 sticky left-0 bg-white border-r border-slate-100">
                    <p className="font-medium text-slate-800 text-sm">{emp.employee_name}</p>
                    <p className="text-[11px] text-slate-400">[{emp.code}] {emp.department || '—'}</p>
                  </td>
                  {days.map(d => {
                    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                    const dow = dayOfWeek(d)
                    const isWeekend = dow === 0 || dow === 6
                    const isHoliday = holidaySet.has(dateStr)
                    const range = emp.ranges.find((r: any) => {
                      const from = String(r.date_from).slice(0,10)
                      const to   = String(r.date_to).slice(0,10)
                      return dateInRange(dateStr, from, to)
                    })
                    if (range) {
                      const Icon = TYPE_ICONS[range.type] || UsersIcon
                      const color = TYPE_COLORS[range.type] || 'bg-slate-400'
                      const isPending = range.status === 'pending'
                      return (
                        <td key={d} className={`p-0 relative ${isHoliday ? 'bg-red-50' : isWeekend ? 'bg-slate-50' : ''}`}>
                          <div className={`h-7 ${color} ${isPending ? 'opacity-50 border-2 border-dashed border-slate-600' : ''}`}
                            title={`${range.type} (${range.status}) — ${range.date_from} a ${range.date_to}: ${range.reason || 'sin motivo'}`}>
                            {d === parseInt(String(range.date_from).slice(8,10)) || d === 1 ? (
                              <Icon size={10} className="text-white absolute top-1.5 left-1" />
                            ) : null}
                          </div>
                        </td>
                      )
                    }
                    return (
                      <td key={d} className={`${
                        isHoliday ? 'bg-red-50' : isWeekend ? 'bg-slate-50' : ''
                      }`}>&nbsp;</td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Avisos de conflicto */}
      {Object.entries(conflicts).filter(([_, c]) => c >= 3).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">Posibles conflictos de cobertura</p>
            <p>Hay días con 3 o más personas con permisos solapados. Revisá la columna marcada con ⚠</p>
          </div>
        </div>
      )}
    </div>
  )
}
