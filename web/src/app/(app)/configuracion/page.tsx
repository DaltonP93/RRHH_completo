'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wifi, WifiOff, RefreshCw, Plus, Trash2, Globe, Zap, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

// ─── Tipos ──────────────────────────────────────────────────────
interface Device { id: number; name: string; ip_address: string; port: number; status: string; last_sync: string }
interface Webhook { id: number; name: string; url: string; events: string[]; active: number; last_called: string; last_status: number }

// ─── APIs ───────────────────────────────────────────────────────
const devicesApi   = { list: () => api.get('/api/devices').then(r => r.data) }
const syncApi      = {
  test:    () => api.get('/api/sync/test').then(r => r.data),
  full:    (body: object) => api.post('/api/sync/full', body).then(r => r.data),
  employees: () => api.post('/api/sync/employees').then(r => r.data),
}
const webhooksApi  = {
  list:   () => api.get('/api/webhooks').then(r => r.data),
  create: (data: object) => api.post('/api/webhooks', data).then(r => r.data),
  test:   (id: number) => api.post(`/api/webhooks/${id}/test`).then(r => r.data),
  delete: (id: number) => api.delete(`/api/webhooks/${id}`).then(r => r.data),
}

// ─── Componente principal ─────────────────────────────────────
export default function ConfiguracionPage() {
  const [tab, setTab] = useState<'relojes'|'sync'|'webhooks'|'api'>('relojes')

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['relojes','sync','webhooks','api'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t === 'relojes' ? '⌚ Relojes ZKTeco'
             : t === 'sync'  ? '🔄 Sincronización att2000'
             : t === 'webhooks' ? '🔗 Webhooks'
             : '📖 API & Integración'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        {tab === 'relojes'   && <RelojesTab />}
        {tab === 'sync'      && <SyncTab />}
        {tab === 'webhooks'  && <WebhooksTab />}
        {tab === 'api'       && <ApiTab />}
      </div>
    </div>
  )
}

// ─── Tab: Relojes ZKTeco ─────────────────────────────────────
function RelojesTab() {
  const { data: devices = [], refetch } = useQuery({ queryKey: ['devices'], queryFn: devicesApi.list })

  const defaultDevices = [
    { id: 101, name: 'Reloj Comedor',  ip_address: '172.16.20.160', port: 4370, status: 'unknown', last_sync: null },
    { id: 103, name: 'Reloj Lavadero', ip_address: '172.16.20.161', port: 4370, status: 'unknown', last_sync: null },
    { id: 1,   name: 'Reloj Gerencia', ip_address: '172.16.20.162', port: 4370, status: 'unknown', last_sync: null },
  ]
  const list = devices.length ? devices : defaultDevices

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Relojes Biométricos ZKTeco</h2>
          <p className="text-sm text-slate-500 mt-0.5">El nuevo sistema se conecta directamente a estos relojes — sin depender del ZK Attendance Management</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      <div className="grid gap-3">
        {list.map((d: Device) => (
          <div key={d.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              d.status === 'online' ? 'bg-green-50 text-green-600' :
              d.status === 'offline' ? 'bg-red-50 text-red-600' :
              'bg-slate-100 text-slate-400'
            }`}>
              {d.status === 'online' ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">{d.name}</p>
              <p className="text-sm text-slate-500 font-mono">{d.ip_address}:{d.port}</p>
              {d.last_sync && <p className="text-xs text-slate-400 mt-0.5">Último sync: {new Date(d.last_sync).toLocaleString()}</p>}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              d.status === 'online'  ? 'bg-green-100 text-green-700' :
              d.status === 'offline' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {d.status === 'online' ? '● En línea' : d.status === 'offline' ? '● Sin conexión' : '● Sin estado'}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">¿Cómo funciona la conexión directa?</p>
        <p>El Bridge Service se conecta a cada reloj vía ZKLib (puerto 4370) y recibe marcajes en tiempo real. También puede recibir datos vía PUSH SDK si el reloj lo soporta.</p>
      </div>
    </div>
  )
}

// ─── Tab: Sincronización con att2000 ─────────────────────────
function SyncTab() {
  const [log, setLog] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [dateTo,   setDateTo]   = useState(new Date().toISOString().split('T')[0])

  const addLog = (msg: string) => setLog(prev => [new Date().toLocaleTimeString() + ' — ' + msg, ...prev])

  async function testConnection() {
    setTesting(true)
    try {
      const result = await syncApi.test()
      addLog(result.ok
        ? `✅ Conexión exitosa a att2000. Total marcajes: ${result.totalRecords?.toLocaleString()}`
        : `❌ Error: ${result.error}`)
    } catch { addLog('❌ Error al conectar — verifica ATT_HOST, ATT_USER y ATT_PASSWORD en .env') }
    setTesting(false)
  }

  async function runFullSync() {
    setSyncing(true)
    addLog(`🔄 Iniciando sincronización ${dateFrom} → ${dateTo}...`)
    try {
      const result = await syncApi.full({ dateFrom, dateTo })
      const r = result.result
      addLog(`✅ Sincronización completa:`)
      addLog(`   Departamentos: ${r.departments?.synced} sincronizados`)
      addLog(`   Relojes: ${r.machines?.synced} sincronizados`)
      addLog(`   Empleados: ${r.employees?.synced} sincronizados (${r.employees?.errors} errores)`)
      addLog(`   Marcajes: ${r.attendance?.imported} importados (${r.attendance?.notFound} sin empleado)`)
    } catch (e: any) { addLog('❌ Error en sincronización: ' + e.message) }
    setSyncing(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-slate-800">Sincronización con att2000</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Importa datos desde la base de datos SQL Server del ZKTeco Attendance Management
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={testConnection} disabled={testing}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-50">
          <Zap size={16} /> {testing ? 'Probando...' : 'Probar conexión att2000'}
        </button>
        <button onClick={runFullSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </div>

      {log.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1 max-h-60 overflow-y-auto">
          {log.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium">Nota importante</p>
        <p>La sincronización es de solo lectura desde att2000. No modifica el ZK Attendance Management ni la base de datos original.</p>
      </div>
    </div>
  )
}

// ─── Tab: Webhooks ────────────────────────────────────────────
function WebhooksTab() {
  const qc = useQueryClient()
  const { data: webhooks = [] } = useQuery({ queryKey: ['webhooks'], queryFn: webhooksApi.list })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', secret: '',
    events: ['attendance.checkin','attendance.checkout','alert.late'] })

  async function createWebhook() {
    await webhooksApi.create(form)
    qc.invalidateQueries({ queryKey: ['webhooks'] })
    setShowForm(false)
    setForm({ name: '', url: '', secret: '', events: ['attendance.checkin','attendance.checkout','alert.late'] })
  }

  async function testWebhook(id: number) {
    await webhooksApi.test(id)
    alert('Evento de prueba enviado')
  }

  async function deleteWebhook(id: number) {
    if (!confirm('¿Eliminar este webhook?')) return
    await webhooksApi.delete(id)
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
          <Plus size={16} /> Agregar webhook
        </button>
      </div>

      {showForm && (
        <div className="border border-blue-100 bg-blue-50 rounded-xl p-5 space-y-3">
          <h3 className="font-medium text-slate-700">Nuevo Webhook</h3>
          <input placeholder="Nombre (ej: Oracle APEX Nómina)" value={form.name}
            onChange={e => setForm(f => ({...f, name: e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
          <input placeholder="URL (ej: https://apex.empresa.com/ords/hr/webhook/attendance)" value={form.url}
            onChange={e => setForm(f => ({...f, url: e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
          <input placeholder="Secreto HMAC (opcional)" value={form.secret}
            onChange={e => setForm(f => ({...f, secret: e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
          <div className="flex gap-3">
            <button onClick={createWebhook} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">
              Guardar
            </button>
            <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {webhooks.length === 0 && (
          <p className="text-center py-8 text-slate-400 text-sm">
            No hay webhooks registrados. Agrega uno para notificar a sistemas externos.
          </p>
        )}
        {webhooks.map((wh: Webhook) => (
          <div key={wh.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100">
            <Globe size={20} className="text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">{wh.name}</p>
              <p className="text-sm text-slate-500 truncate">{wh.url}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                {(Array.isArray(wh.events) ? wh.events : JSON.parse(wh.events||'[]')).map((e: string) => (
                  <span key={e} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{e}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {wh.last_status === 200 ? <CheckCircle size={16} className="text-green-500" /> :
               wh.last_status > 0    ? <XCircle size={16} className="text-red-500" /> :
                                       <AlertCircle size={16} className="text-slate-400" />}
              <button onClick={() => testWebhook(wh.id)}
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg">
                Test
              </button>
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-slate-800">API & Documentación</h2>
        <p className="text-sm text-slate-500 mt-0.5">Integra el sistema con Oracle APEX, ERP, nómina y cualquier otro sistema</p>
      </div>

      <div className="grid gap-3">
        <a href={`${apiUrl}/api/docs`} target="_blank"
          className="flex items-center gap-4 p-4 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">API</div>
          <div>
            <p className="font-semibold text-blue-800">Swagger UI — Documentación Interactiva</p>
            <p className="text-sm text-blue-600">{apiUrl}/api/docs</p>
          </div>
        </a>

        <a href={`${apiUrl}/api/docs.json`} target="_blank"
          className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
          <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-white font-bold text-xs">JSON</div>
          <div>
            <p className="font-semibold text-slate-800">OpenAPI Schema (para Postman / Oracle APEX REST)</p>
            <p className="text-sm text-slate-500">{apiUrl}/api/docs.json</p>
          </div>
        </a>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-slate-700">Endpoints de Integración</h3>
        {[
          { method: 'GET',  path: '/api/integration/attendance/today',  desc: 'Asistencia del día actual' },
          { method: 'GET',  path: '/api/integration/attendance/range',  desc: 'Rango de fechas (para nómina)' },
          { method: 'GET',  path: '/api/integration/employees',         desc: 'Lista de empleados activos' },
          { method: 'GET',  path: '/api/integration/stats/summary',     desc: 'KPIs del día (para dashboards)' },
          { method: 'POST', path: '/api/integration/checkin',           desc: 'Registrar marcaje desde sistema externo' },
        ].map(e => (
          <div key={e.path} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 font-mono text-sm">
            <span className={`px-2 py-0.5 rounded font-bold text-xs ${e.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {e.method}
            </span>
            <span className="text-slate-700 flex-1">{e.path}</span>
            <span className="text-slate-400 text-xs font-sans">{e.desc}</span>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 rounded-xl p-4 text-sm font-mono text-green-400">
        <p className="text-slate-400 text-xs mb-2"># Ejemplo: llamar desde Oracle APEX PL/SQL</p>
        <p>l_response := UTL_HTTP.GET(</p>
        <p>  url     =&gt; '{apiUrl}/api/integration/attendance/today',</p>
        <p>  headers =&gt; 'X-API-Key: TU_CLAVE_API'</p>
        <p>);</p>
      </div>

      <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-700">
        <p className="font-medium">Ver documentación completa Oracle APEX</p>
        <p>En la carpeta del proyecto: <code className="bg-green-100 px-1 rounded">docs/ORACLE-APEX-INTEGRATION.md</code></p>
        <p>Incluye código PL/SQL completo, configuración de ACL, webhooks ORDS y ejemplos de reportes.</p>
      </div>
    </div>
  )
}
