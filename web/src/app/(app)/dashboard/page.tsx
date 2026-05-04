'use client'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { Users, Clock, AlertTriangle, UserCheck, Activity, RefreshCw } from 'lucide-react'
import { attendanceApi, api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useI18n } from '@/i18n/I18nProvider'

interface AttendanceEvent {
  employeeId: number
  employeeName: string
  timestamp: string
  type: 'in' | 'out' | 'unknown'
  source: 'device' | 'mobile' | 'manual'
  deviceId?: number
}

const TYPE_COLORS = { in: 'bg-green-100 text-green-800', out: 'bg-blue-100 text-blue-800', unknown: 'bg-gray-100 text-gray-700' }
const SOURCE_ICONS = { device: '🖐️', mobile: '📱', manual: '✏️' }

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

export default function DashboardPage() {
  const { t, locale } = useI18n()
  const qc = useQueryClient()
  const [liveEvents, setLiveEvents] = useState<AttendanceEvent[]>([])
  const [today, setToday] = useState('')
  const [recalcLoading, setRecalcLoading] = useState(false)
  const TYPE_LABELS: Record<string, string> = {
    in: t('attendance.in'),
    out: t('attendance.out'),
    unknown: t('attendance.manual_punch'),
  }
  // Render fecha solo en cliente para evitar hydration mismatch (React #418/#423/#425)
  useEffect(() => {
    setToday(format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es }))
  }, [locale])

  // Datos iniciales via API
  const { data, refetch } = useQuery({
    queryKey: ['attendance-live'],
    queryFn: attendanceApi.live,
    refetchInterval: 60_000,
  })

  // Escuchar Socket.io para tiempo real
  useEffect(() => {
    const socket = getSocket()

    socket.on('attendance:new', (event: AttendanceEvent) => {
      setLiveEvents(prev => [event, ...prev].slice(0, 50))
      refetch()
    })

    return () => { socket.off('attendance:new') }
  }, [refetch])

  const stats = data?.stats || {}
  const recentLogs = [...liveEvents, ...(data?.recentLogs || [])].slice(0, 20)

  const pieData = [
    { name: t('dashboard.present'),     value: stats.present     || 0 },
    { name: t('dashboard.late'),        value: stats.late         || 0 },
    { name: t('dashboard.absent'),      value: stats.absent       || 0 },
    { name: t('dashboard.permissions'), value: stats.on_permission || 0 },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('nav.dashboard')}</h1>
          <p className="text-slate-500 capitalize" suppressHydrationWarning>{today || '\u00a0'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setRecalcLoading(true)
              try {
                await api.post('/api/attendance/recalc-summary')
                await qc.invalidateQueries({ queryKey: ['attendance-live'] })
              } finally { setRecalcLoading(false) }
            }}
            disabled={recalcLoading}
            title="Recalcular resumen del d\u00eda (sincroniza KPIs con datos de relojes)"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-full border border-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={recalcLoading ? 'animate-spin' : ''} />
            Actualizar KPIs
          </button>
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-500 pulse-live" />
            <span className="text-sm font-medium text-green-700">{t('dashboard.live_feed')}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users size={22} />}
          label={t('nav.employees')}
          value={stats.total_employees || 0}
          color="blue"
        />
        <KpiCard
          icon={<UserCheck size={22} />}
          label={t('dashboard.present')}
          value={(stats.present || 0) + (stats.late || 0)}
          color="green"
          sub={`${Math.round(((stats.present || 0) + (stats.late || 0)) / (stats.total_employees || 1) * 100)}%`}
        />
        <KpiCard
          icon={<Clock size={22} />}
          label={t('dashboard.late')}
          value={stats.late || 0}
          color="amber"
        />
        <KpiCard
          icon={<AlertTriangle size={22} />}
          label={t('dashboard.absent')}
          value={stats.absent || 0}
          color="red"
        />
      </div>

      {/* Charts + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">{t('dashboard.today_attendance')}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Live Feed */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-blue-500" />
            <h2 className="font-semibold text-slate-700">{t('dashboard.live_feed')}</h2>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {recentLogs.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-8">{t('dashboard.no_marks_today')}</p>
            )}
            {recentLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 slide-in">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{SOURCE_ICONS[log.source as keyof typeof SOURCE_ICONS] || '🖐️'}</span>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{log.employeeName || log.employee_name}</p>
                    <p className="text-xs text-slate-400">
                      {(() => {
                        // Normalizar: MySQL devuelve "YYYY-MM-DD HH:mm:ss" sin TZ
                        // lo forzamos a Paraguay (America/Asuncion) para display correcto
                        const raw = log.timestamp as string
                        const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + '-03:00'
                        return new Date(iso).toLocaleTimeString('es-PY', {
                          timeZone: 'America/Asuncion',
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                        })
                      })()}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLORS[log.type as keyof typeof TYPE_COLORS] || TYPE_COLORS.unknown}`}>
                  {TYPE_LABELS[log.type as keyof typeof TYPE_LABELS] || 'Marcaje'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'blue' | 'green' | 'amber' | 'red'
  sub?: string
}) {
  const colors = {
    blue:  'bg-blue-50  text-blue-600  border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red:   'bg-red-50   text-red-600   border-red-100',
  }
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-5`}>
      <div className={`inline-flex p-2.5 rounded-xl ${colors[color]} mb-3`}>{icon}</div>
      <p className="text-slate-500 text-sm">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}
