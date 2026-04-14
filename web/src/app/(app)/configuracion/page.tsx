'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Wifi, WifiOff, RefreshCw, Plus, Trash2, Globe,
  Zap, CheckCircle, XCircle, AlertCircle, Database,
  Server, Eye, EyeOff
} from 'lucide-react'
import { api } from '@/lib/api'

// ─── Tipos ──────────────────────────────────────────────────────
interface Device   { id: number; name: string; ip_address: string; port: number; status: string; last_sync: string }
interface Webhook  { id: number; name: string; url: string; events: string[]; active: number; last_called: string; last_status: number }
interface DbConn   { host: string; port: string; database: string; user: string; password: string; label: string }

// ─── Componente principal ─────────────────────────────────────
export default function ConfiguracionPage() {
  const [tab, setTab] = useState<'relojes'|'sync'|'webhooks'|'api'>('relojes')

  const tabs = [
    { id: 'relojes',  label: '⌚ Relojes ZKTeco' },
    { id: 'sync',     label: '🔄 Sincronización BD' },
    { id: 'webhooks', label: '🔗 Webhooks' },
    { id: 'api',      label: '📖 API & Integración' },
  ] as const

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map(t => (
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

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        {tab === 'relojes'  && <RelojesTab />}
        {tab === 'sync'     && <SyncTab />}
        {tab === 'webhooks' && <WebhooksTab />}
        {tab === 'api'      && <ApiTab />}
      </div>
    </div>
  )
}

// ─── Tab: Relojes ZKTeco ─────────────────────────────────────
function RelojesTab() {
  // Carga devices solo cuando el usuario hace clic en Actualizar
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)

  const defaultDevices: Device[] = [
    { id: 101, name: 'Reloj Comedor',  ip_address: '172.16.20.160', port: 4370, status: 'unknown', last_sync: '' },
    { id: 103, name: 'Reloj Lavadero', ip_address: '172.16.20.161', port: 4370, status: 'unknown', last_sync: '' },
    { id: 1,   name: 'Reloj Gerencia', ip_address: '172.16.20.162', port: 4370, status: 'unknown', last_sync: '' },
  ]

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.get('/api/devices')
      setDevices(r.data)
    } catch { /* usa defaults */ }
    setLoading(false)
  }

  const list = devices.length ? devices : defaultDevices

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Relojes Biométricos ZKTeco</h2>
          <p className="text-sm text-slate-500 mt-0.5">Conexión directa a los relojes — sin depender del ZK Attendance Management</p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar estado
        </button>
      </div>

      <div className="grid gap-3">
        {list.map((d: Device) => (
          <div key={d.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              d.status === 'online'  ? 'bg-green-50 text-green-600' :
              d.status === 'offline' ? 'bg-red-50 text-red-600' :
                                      'bg-slate-100 text-slate-400'
            }`}>
              {d.status === 'online' ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">{d.name}</p>
              <p className="text-sm text-slate-500 font-mono">{d.ip_address}:{d.port}</p>
              {d.last_sync && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Último sync: {new Date(d.last_sync).toLocaleString()}
                </p>
              )}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              d.status === 'online'  ? 'bg-green-100 text-green-700' :
              d.status === 'offline' ? 'bg-red-100 text-red-700' :
                                      'bg-slate-100 text-slate-500'
            }`}>
              {d.status === 'online' ? '● En línea' :
               d.status === 'offline' ? '● Sin conexión' : '● Sin estado'}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">¿Cómo funciona la conexión directa?</p>
        <p>El Bridge Service se conecta a cada reloj vía ZKLib (puerto 4370) y recibe marcajes en tiempo real.</p>
      </div>
    </div>
  )
}

// ─── Tab: Sincronización con BD externa ───────────────────────
function SyncTab() {
  const [log, setLog]         = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const today     = new Date().toISOString().split('T')[0]
  const firstDay  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(firstDay)
  const [dateTo,   setDateTo]   = useState(today)

  // Conexión configurable — valores de att2000 por defecto
  const [conn, setConn] = useState<DbConn>({
    host:     '10.81.28.8',
    port:     '1433',
    database: 'att2000',
    user:     'sa',
    password: '',
    label:    'ZKTeco Attendance Management'
  })

  const addLog = (msg: string) => setLog(prev => [new Date().toLocaleTimeString() + ' — ' + msg, ...prev])
  const setField = (k: keyof DbConn) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConn(c => ({ ...c, [k]: e.target.value }))

  async function testConnection() {
    setTesting(true)
    addLog(`🔌 Probando conexión a ${conn.host}:${conn.port}/${conn.database}...`)
    try {
      const r = await api.post('/api/sync/test-conn', conn)
      addLog(r.data.ok
        ? `✅ Conexión exitosa — ${r.data.totalRecords?.toLocaleString() ?? 0} marcajes encontrados`
        : `❌ Error: ${r.data.error}`)
    } catch (e: any) {
      addLog(`❌ Error: ${e.response?.data?.error || e.message}`)
    }
    setTesting(false)
  }

  async function runSync() {
    setSyncing(true)
    addLog(`🔄 Sincronizando ${dateFrom} → ${dateTo} desde ${conn.host}/${conn.database}...`)
    try {
      const r = await api.post('/api/sync/full', { dateFrom, dateTo, conn })
      const res = r.data.result
      addLog('✅ Sincronización completada:')
      if (res?.departments) addLog(`   📁 Departamentos: ${res.departments.synced} sincronizados`)
      if (res?.employees)   addLog(`   👥 Empleados: ${res.employees.synced} sincronizados (${res.employees.errors ?? 0} errores)`)
      if (res?.attendance)  addLog(`   🕐 Marcajes: ${res.attendance.imported} importados`)
      if (res?.machines)    addLog(`   ⌚ Relojes: ${res.machines.synced} sincronizados`)
    } catch (e: any) {
      addLog(`❌ Error: ${e.response?.data?.error || e.message}`)
    }
    setSyncing(false)
  }

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const labelCls = "text-xs font-medium text-slate-600 block mb-1"

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-slate-800">Sincronización con Base de Datos Externa</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Importa empleados y marcajes desde SQL Server (ZKTeco, u otro sistema)
        </p>
      </div>

      {/* Configuración de conexión */}
      <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Server size={16} className="text-blue-600" />
          <h3 className="font-medium text-slate-800">Configuración de Conexión</h3>
        </div>

        <div>
          <label className={labelCls}>Nombre / Etiqueta</label>
          <input value={conn.label} onChange={setField('label')} placeholder="ej: ZKTeco Attendance Management" className={inputCls} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Host / IP del servidor SQL Server</label>
            <input value={conn.host} onChange={setField('host')} placeholder="ej: 10.81.28.8 o ADVENTISTA" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Puerto</label>
            <input value={conn.port} onChange={setField('port')} placeholder="1433" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Base de Datos</label>
          <input value={conn.database} onChange={setField('database')} placeholder="ej: att2000" className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Usuario</label>
            <input value={conn.user} onChange={setField('user')} placeholder="sa" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={conn.password}
                onChange={setField('password')}
                placeholder="••••••••"
                className={inputCls + ' pr-10'}
              />
              <button onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Database size={16} className="text-blue-600" />
          <h3 className="font-medium text-slate-800">Período a Sincronizar</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-3">
        <button onClick={testConnection} disabled={testing || !conn.host}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <Zap size={16} className="text-yellow-500" />
          {testing ? 'Probando...' : 'Probar conexión'}
        </button>
        <button onClick={runSync} disabled={syncing || !conn.host || !conn.password}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </div>

      {/* Log de resultados */}
      {log.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1 max-h-60 overflow-y-auto">
          {log.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium">Solo lectura</p>
        <p>La sincronización no modifica la base de datos de origen. Solo importa datos al sistema.</p>
      </div>
    </div>
  )
}

// ─── Tab: Webhooks ────────────────────────────────────────────
function WebhooksTab() {
  const qc = useQueryClient()
  const { data: webhooks = [] } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/api/webhooks').then(r => r.data)
  })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', url: '', secret: '',
    events: ['attendance.checkin','attendance.checkout','alert.late']
  })

  async function createWebhook() {
    await api.post('/api/webhooks', form)
    qc.invalidateQueries({ queryKey: ['webhooks'] })
    setShowForm(false)
    setForm({ name: '', url: '', secret: '', events: ['attendance.checkin','attendance.checkout','alert.late'] })
  }

  async function deleteWebhook(id: number) {
    if (!confirm('¿Eliminar este webhook?')) return
    await api.delete(`/api/webhooks/${id}`)
    qc.invalidateQueries({ queryKey: ['webhooks'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Webhooks</h2>
          <p className="text-sm text-slate-500 mt-0.5">Notifica a sistemas externos cuando ocurre un marcaje</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">
          <Plus size={16} /> Agregar
        </button>
      </div>

      {showForm && (
        <div className="border border-blue-100 bg-blue-50 rounded-xl p-5 space-y-3">
          <h3 className="font-medium text-slate-700">Nuevo Webhook</h3>
          {['name','url','secret'].map(field => (
            <input key={field}
              placeholder={field === 'name' ? 'Nombre (ej: Oracle APEX Nómina)' : field === 'url' ? 'URL del endpoint' : 'Secreto HMAC (opcional)'}
              value={(form as any)[field]}
              onChange={e => setForm(f => ({...f, [field]: e.target.value}))}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
          ))}
          <div className="flex gap-3">
            <button onClick={createWebhook} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">Guardar</button>
            <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(webhooks as Webhook[]).length === 0 && (
          <p className="text-center py-8 text-slate-400 text-sm">No hay webhooks registrados.</p>
        )}
        {(webhooks as Webhook[]).map(wh => (
          <div key={wh.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100">
            <Globe size={20} className="text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">{wh.name}</p>
              <p className="text-sm text-slate-500 truncate">{wh.url}</p>
            </div>
            <div className="flex items-center gap-2">
              {wh.last_status === 200 ? <CheckCircle size={16} className="text-green-500" /> :
               wh.last_status > 0    ? <XCircle size={16} className="text-red-500" /> :
                                       <AlertCircle size={16} className="text-slate-400" />}
              <button onClick={() => deleteWebhook(wh.id)}
                className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: API & Integración ───────────────────────────────────
function ApiTab() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  const endpoints = [
    { method: 'GET',  path: '/api/integration/attendance/today', desc: 'Asistencia del día actual' },
    { method: 'GET',  path: '/api/integration/attendance/range', desc: 'Rango de fechas (para nómina)' },
    { method: 'GET',  path: '/api/integration/employees',        desc: 'Lista de empleados activos' },
    { method: 'GET',  path: '/api/integration/stats/summary',    desc: 'KPIs del día' },
    { method: 'POST', path: '/api/integration/checkin',          desc: 'Registrar marcaje externo' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-slate-800">API & Documentación</h2>
        <p className="text-sm text-slate-500 mt-0.5">Integra con Oracle APEX, ERP, nómina y cualquier sistema</p>
      </div>

      <a href={`${apiUrl}/api/docs`} target="_blank"
        className="flex items-center gap-4 p-4 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">API</div>
        <div>
          <p className="font-semibold text-blue-800">Swagger UI — Documentación Interactiva</p>
          <p className="text-sm text-blue-600">{apiUrl}/api/docs</p>
        </div>
      </a>

      <div className="space-y-2">
        {endpoints.map(e => (
          <div key={e.path} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 font-mono text-sm">
            <span className={`px-2 py-0.5 rounded font-bold text-xs ${e.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {e.method}
            </span>
            <span className="text-slate-700 flex-1">{e.path}</span>
            <span className="text-slate-400 text-xs font-sans">{e.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
