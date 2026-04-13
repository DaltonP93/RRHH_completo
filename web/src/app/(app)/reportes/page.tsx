'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart2, RefreshCw, Plus, Trash2, Mail, Clock, Settings } from 'lucide-react'
import { api } from '@/lib/api'

// ─── Helpers ─────────────────────────────────────────────────────
function minsToHM(mins: number | null) {
  if (!mins || mins <= 0) return '0:00'
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

// ─── Tab: Reporte Marcadas (igual al PDF del sistema ZKTeco) ──────
function TabMarcadas() {
  const today       = format(new Date(), 'yyyy-MM-dd')
  const firstOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')

  const [from, setFrom]     = useState(firstOfMonth)
  const [to, setTo]         = useState(today)
  const [empId, setEmpId]   = useState('')
  const [emailTo, setEmailTo] = useState('')
  const [sending, setSending] = useState(false)
  const [queried, setQueried] = useState(false)

  const { data: empsData } = useQuery({
    queryKey: ['employees-select'],
    queryFn: () => api.get('/api/employees', { params: { limit: 500, status: 'active' } }).then(r => r.data),
    staleTime: 60_000,
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['marcadas', from, to, empId],
    queryFn: () => api.get('/api/reports/marcadas', { params: { from, to, employeeId: empId || undefined } }).then(r => r.data),
    enabled: queried,
  })

  function handleGenerar() { setQueried(true); refetch() }

  async function sendByEmail() {
    if (!emailTo.trim()) return alert('Ingresa un email destino')
    setSending(true)
    try {
      await api.post('/api/reports/marcadas/email', {
        from, to,
        employeeId: empId || undefined,
        recipients: emailTo.split(',').map((e: string) => e.trim()),
      })
      alert('Reporte enviado por email ✅')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al enviar')
    } finally { setSending(false) }
  }

  const employees: any[] = data?.data || []
  const maxPairs = employees.length
    ? Math.max(...employees.flatMap((e: any) => e.rows).map((r: any) => r.pairs.length), 1)
    : 1

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hasta</label>
            <input type="date" value={to} max={today} onChange={e => setTo(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">Empleado</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Todos los empleados</option>
              {(empsData?.data || []).map((e: any) => (
                <option key={e.id} value={e.id}>[{e.code}] {e.full_name}</option>
              ))}
            </select>
          </div>
          <button onClick={handleGenerar}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700">
            <RefreshCw size={14} /> Generar reporte
          </button>
        </div>

        {employees.length > 0 && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 items-center">
            <Mail size={16} className="text-slate-400 shrink-0" />
            <input value={emailTo} onChange={e => setEmailTo(e.target.value)}
              placeholder="email@destino.com  (varios separados por coma)"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button onClick={sendByEmail} disabled={sending}
              className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60 whitespace-nowrap">
              {sending ? 'Enviando...' : 'Enviar por email'}
            </button>
          </div>
        )}
      </div>

      {isLoading && <div className="text-center py-12 text-slate-400">Generando reporte...</div>}
      {!isLoading && queried && employees.length === 0 && (
        <div className="text-center py-12 text-slate-400">Sin marcaciones en este período</div>
      )}

      {employees.map((emp: any) => (
        <div key={emp.employee_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">{emp.employee_name}</p>
              <p className="text-xs text-slate-500">Cód. {emp.code} · {emp.department || 'Sin depto'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-0.5">Total período</p>
              <p className="text-2xl font-bold text-blue-700">{emp.total_hm}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs w-40">Fecha</th>
                  {Array.from({ length: maxPairs }).flatMap((_, i) => [
                    <th key={`e${i}`} className="text-center px-3 py-2.5 text-slate-500 font-medium text-xs">Entrada</th>,
                    <th key={`s${i}`} className="text-center px-3 py-2.5 text-slate-500 font-medium text-xs">Salida</th>,
                  ])}
                  <th className="text-right px-4 py-2.5 text-slate-500 font-medium text-xs">Total Permanencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {emp.rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{row.dayName}</span>{' '}
                      <span className="font-mono text-slate-500">{row.date}</span>
                    </td>
                    {Array.from({ length: maxPairs }).flatMap((_, pi) => {
                      const p = row.pairs[pi] || { entrada: '', salida: '' }
                      return [
                        <td key={`e${pi}`} className="px-3 py-2 text-center font-mono text-xs text-slate-700">{p.entrada}</td>,
                        <td key={`s${pi}`} className="px-3 py-2 text-center font-mono text-xs text-slate-700">{p.salida}</td>,
                      ]
                    })}
                    <td className={`px-4 py-2 text-right font-bold font-mono text-sm ${
                      row.total === '0:00' ? 'text-red-400' : 'text-blue-700'
                    }`}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t border-blue-100">
                  <td colSpan={1 + maxPairs * 2} className="px-4 py-3 text-sm font-semibold text-slate-600">Total período</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700 text-lg">{emp.total_hm}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Mensual ────────────────────────────────────────────────
function TabMensual() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data, isLoading } = useQuery({
    queryKey: ['report-monthly', year, month],
    queryFn: () => api.get('/api/reports/monthly', { params: { year, month } }).then(r => r.data),
  })

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Mes</label>
          <select value={month} onChange={e => setMonth(+e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
            {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i) => (
              <option key={i+1} value={i+1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Año</label>
          <select value={year} onChange={e => setYear(+e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Cargando...</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Empleado','Depto.','Presentes','Retardos','Ausencias','Horas','Min. Tardanza'].map(h => (
                  <th key={h} className={`px-4 py-3 text-slate-500 font-medium ${h === 'Empleado' || h === 'Depto.' ? 'text-left' : 'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data?.data || []).map((emp: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{emp.employee_name}</td>
                  <td className="px-4 py-3 text-slate-500">{emp.department || '—'}</td>
                  <td className="px-4 py-3 text-center font-semibold text-green-700">{emp.days_present}</td>
                  <td className="px-4 py-3 text-center font-semibold text-amber-600">{emp.days_late}</td>
                  <td className="px-4 py-3 text-center font-semibold text-red-600">{emp.days_absent}</td>
                  <td className="px-4 py-3 text-center font-mono">{minsToHM(emp.total_worked_minutes)}</td>
                  <td className="px-4 py-3 text-center text-amber-600">{emp.total_late_minutes || 0} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Reportes programados ───────────────────────────────────
function TabScheduled() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', cron_expression: '0 8 1 * *', period_type: 'monthly', recipients: '' })
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['report-schedules'],
    queryFn: () => api.get('/api/notifications/schedules').then(r => r.data),
  })

  const PRESETS = [
    { label: 'Cada lunes 8am',     value: '0 8 * * 1'   },
    { label: '1° del mes 8am',     value: '0 8 1 * *'   },
    { label: 'Diario Lun-Vie 7am', value: '0 7 * * 1-5' },
    { label: 'Viernes 5pm',        value: '0 17 * * 5'  },
  ]

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/api/notifications/schedules', { ...form, report_type: 'marcadas' })
      qc.invalidateQueries({ queryKey: ['report-schedules'] })
      setShowForm(false)
    } catch (err: any) { alert(err?.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">Los reportes se generan y envían por email automáticamente.</p>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">
          <Plus size={15} /> Nuevo
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
          <form onSubmit={create} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Reporte mensual RH"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Período</label>
                <select value={form.period_type} onChange={e => setForm(p => ({ ...p, period_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expresión cron <span className="text-red-500">*</span></label>
                <input required value={form.cron_expression} onChange={e => setForm(p => ({ ...p, cron_expression: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {PRESETS.map(p => (
                    <button key={p.value} type="button" onClick={() => setForm(f => ({ ...f, cron_expression: p.value }))}
                      className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-blue-100 text-slate-600 rounded">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Destinatarios (email, separados por coma) <span className="text-red-500">*</span></label>
                <input required value={form.recipients} onChange={e => setForm(p => ({ ...p, recipients: e.target.value }))}
                  placeholder="rh@empresa.com, gerencia@empresa.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
                {saving ? 'Guardando...' : 'Crear reporte programado'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {isLoading && <div className="text-center py-8 text-slate-400">Cargando...</div>}
        {(data || []).map((s: any) => (
          <div key={s.id} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 ${!s.active ? 'opacity-60' : ''}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
              <Clock size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900">{s.name}</p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{s.cron_expression}</span>
                <span>{s.period_type}</span>
                <span>→ {s.recipients}</span>
                {s.last_run && <span>Últ: {new Date(s.last_run).toLocaleDateString('es')}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={async () => { await api.put(`/api/notifications/schedules/${s.id}`, { active: s.active ? 0 : 1 }); qc.invalidateQueries({ queryKey: ['report-schedules'] }) }}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium ${s.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {s.active ? 'Activo' : 'Inactivo'}
              </button>
              <button onClick={async () => { if(confirm('¿Eliminar?')) { await api.delete(`/api/notifications/schedules/${s.id}`); qc.invalidateQueries({queryKey:['report-schedules']}) } }}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        {!isLoading && !(data?.length) && (
          <div className="text-center py-10 text-slate-400">Sin reportes programados. Crea uno arriba.</div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: SMTP ───────────────────────────────────────────────────
function TabSMTP() {
  const [form, setForm] = useState({ host: '', port: '587', secure: false, user: '', password: '', from: '' })
  const [testEmail, setTestEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<null | { sent: boolean; reason?: string }>(null)

  useQuery({
    queryKey: ['smtp-config'],
    queryFn: () => api.get('/api/notifications/smtp').then(r => r.data),
    staleTime: Infinity,
    onSuccess: (d: any) => {
      if (d.configured) setForm(p => ({ ...p, host: d.host || '', port: String(d.port || 587), secure: !!d.secure, user: d.user || '', from: d.from || '' }))
    },
  } as any)

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try { await api.put('/api/notifications/smtp', form); alert('Configuración SMTP guardada ✅') }
    catch (err: any) { alert(err?.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  async function testSMTP() {
    if (!testEmail) return; setTesting(true); setTestResult(null)
    try { const r = await api.post('/api/notifications/smtp/test', { to: testEmail }); setTestResult(r.data) }
    catch (err: any) { setTestResult({ sent: false, reason: err?.response?.data?.reason || 'Error de conexión' }) }
    finally { setTesting(false) }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 text-sm text-amber-700">
        La configuración SMTP se usa para enviar reportes automáticos y alertas.
        Para Gmail usa una <strong>App Password</strong> (no la contraseña normal).
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Servidor SMTP</label>
              <input value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))}
                placeholder="smtp.gmail.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Puerto</label>
              <input value={form.port} onChange={e => setForm(p => ({ ...p, port: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
              <input value={form.user} onChange={e => setForm(p => ({ ...p, user: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña / App Password</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remitente (From)</label>
            <input value={form.from} onChange={e => setForm(p => ({ ...p, from: e.target.value }))}
              placeholder="Sistema RH <rh@empresa.com>"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.secure} onChange={e => setForm(p => ({ ...p, secure: e.target.checked }))} className="accent-blue-600 w-4 h-4" />
            <span className="text-sm text-slate-700">Usar SSL/TLS (puerto 465)</span>
          </label>
          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar configuración SMTP'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">Probar configuración</h3>
        <div className="flex gap-2">
          <input value={testEmail} onChange={e => setTestEmail(e.target.value)} type="email" placeholder="test@email.com"
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={testSMTP} disabled={testing || !testEmail}
            className="bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
            {testing ? 'Enviando...' : 'Probar'}
          </button>
        </div>
        {testResult && (
          <p className={`mt-3 text-sm font-medium ${testResult.sent ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.sent ? '✅ Email enviado correctamente' : `❌ Error: ${testResult.reason}`}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export default function ReportesPage() {
  const [tab, setTab] = useState<'marcadas' | 'mensual' | 'programados' | 'smtp'>('marcadas')

  const TABS = [
    { id: 'marcadas'    as const, label: '📋 Marcadas por empleado' },
    { id: 'mensual'     as const, label: '📊 Resumen mensual'       },
    { id: 'programados' as const, label: '🕐 Reportes automáticos'  },
    { id: 'smtp'        as const, label: '📧 Email SMTP'            },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="text-blue-600" size={26} />
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
      </div>
      <div className="flex gap-2 border-b border-slate-200 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'marcadas'    && <TabMarcadas />}
      {tab === 'mensual'     && <TabMensual />}
      {tab === 'programados' && <TabScheduled />}
      {tab === 'smtp'        && <TabSMTP />}
    </div>
  )
}
