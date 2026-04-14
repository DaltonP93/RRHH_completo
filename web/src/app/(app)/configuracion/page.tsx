'use client'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Wifi, WifiOff, RefreshCw, Plus, Trash2, Globe,
  Zap, CheckCircle, XCircle, AlertCircle, Database,
  Server, Eye, EyeOff, Save, Activity, Edit2, X,
  Monitor, Users, Download, Eraser, Clock,
  MapPin, Hash, ChevronDown, ChevronUp, Image,
  Info, Settings2, Power, PowerOff, HardDrive,
  Cpu, MemoryStick, Fingerprint
} from 'lucide-react'
import { api } from '@/lib/api'

// ─── Tipos ──────────────────────────────────────────────────────
interface Device {
  id: number; name: string; ip_address: string; port: number
  location?: string; serial_no?: string; status?: string; last_sync?: string
}
interface Webhook  { id: number; name: string; url: string; events: string[]; active: number; last_called: string; last_status: number }
interface DbConn   { host: string; port: string; database: string; user: string; password: string; label: string }
interface SystemSettings {
  system_name: string; system_logo_url: string; system_favicon_url: string
  system_login_bg: string; system_primary_color: string
  system_login_title: string; system_login_subtitle: string; system_company: string
}

const CONN_KEY = 'sishoras_db_conn'
function loadConn(): DbConn {
  if (typeof window === 'undefined') return defaultConn()
  try { const s = localStorage.getItem(CONN_KEY); if (s) return JSON.parse(s) } catch {}
  return defaultConn()
}
function defaultConn(): DbConn {
  return { host: '10.81.28.8', port: '1433', database: 'att2000', user: 'sa', password: '', label: 'ZKTeco Attendance Management' }
}

const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
const labelCls = "text-xs font-medium text-slate-600 block mb-1"

// ─── Componente principal ─────────────────────────────────────
export default function ConfiguracionPage() {
  const [tab, setTab] = useState<'sistema'|'relojes'|'sync'|'webhooks'|'api'>('relojes')

  const tabs = [
    { id: 'sistema',   label: '🖥️ Sistema' },
    { id: 'relojes',   label: '⌚ Relojes ZKTeco' },
    { id: 'sync',      label: '🔄 Sincronización BD' },
    { id: 'webhooks',  label: '🔗 Webhooks' },
    { id: 'api',       label: '📖 API & Integración' },
  ] as const

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
      <div className="flex gap-1 border-b border-slate-200 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}>{t.label}</button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        {tab === 'sistema'  && <SistemaTab />}
        {tab === 'relojes'  && <RelojesTab />}
        {tab === 'sync'     && <SyncTab />}
        {tab === 'webhooks' && <WebhooksTab />}
        {tab === 'api'      && <ApiTab />}
      </div>
    </div>
  )
}

// ─── Tab: Sistema (Branding) ──────────────────────────────────
function SistemaTab() {
  const [settings, setSettings] = useState<SystemSettings>({
    system_name: 'Sistema de Asistencia', system_logo_url: '', system_favicon_url: '',
    system_login_bg: 'from-slate-900 to-blue-900', system_primary_color: '#2563eb',
    system_login_title: 'Sistema de Asistencia', system_login_subtitle: 'Recursos Humanos', system_company: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/settings').then(r => { setSettings(s => ({ ...s, ...r.data })); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const setField = (k: keyof SystemSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(s => ({ ...s, [k]: e.target.value }))

  async function save() {
    setSaving(true)
    try {
      await api.put('/api/settings', settings)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { alert('Error al guardar: ' + (e.response?.data?.error || e.message)) }
    setSaving(false)
  }

  if (loading) return <div className="py-8 text-center text-slate-400">Cargando configuración...</div>

  const gradients = [
    { value: 'from-slate-900 to-blue-900',    label: 'Slate → Azul (default)' },
    { value: 'from-blue-900 to-indigo-900',   label: 'Azul → Índigo' },
    { value: 'from-slate-900 to-slate-700',   label: 'Gris oscuro' },
    { value: 'from-emerald-900 to-teal-800',  label: 'Verde esmeralda' },
    { value: 'from-purple-900 to-indigo-800', label: 'Púrpura' },
    { value: 'from-rose-900 to-pink-800',     label: 'Rosa' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-slate-800">Personalización del Sistema</h2>
        <p className="text-sm text-slate-500 mt-0.5">Logo, nombre, colores y pantalla de login</p>
      </div>

      {/* Identidad */}
      <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Monitor size={16} className="text-blue-600" />
          <h3 className="font-medium text-slate-800">Identidad del Sistema</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nombre del sistema</label>
            <input value={settings.system_name} onChange={setField('system_name')} placeholder="Sistema de Asistencia" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Empresa / Organización</label>
            <input value={settings.system_company} onChange={setField('system_company')} placeholder="Mi Empresa S.A." className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>URL del logo (PNG/SVG)</label>
          <input value={settings.system_logo_url} onChange={setField('system_logo_url')} placeholder="https://miempresa.com/logo.png" className={inputCls} />
          {settings.system_logo_url && (
            <img src={settings.system_logo_url} alt="preview" className="mt-2 h-10 object-contain rounded border border-slate-100 p-1"
              onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
          )}
        </div>
        <div>
          <label className={labelCls}>URL del favicon (.ico o .png pequeño)</label>
          <input value={settings.system_favicon_url} onChange={setField('system_favicon_url')} placeholder="https://miempresa.com/favicon.ico" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Color principal</label>
          <div className="flex items-center gap-3">
            <input type="color" value={settings.system_primary_color} onChange={setField('system_primary_color')}
              className="h-10 w-20 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
            <input value={settings.system_primary_color} onChange={setField('system_primary_color')}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
          </div>
        </div>
      </div>

      {/* Login */}
      <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Image size={16} className="text-blue-600" />
          <h3 className="font-medium text-slate-800">Pantalla de Login</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Título del login</label>
            <input value={settings.system_login_title} onChange={setField('system_login_title')} placeholder="Sistema de Asistencia" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Subtítulo</label>
            <input value={settings.system_login_subtitle} onChange={setField('system_login_subtitle')} placeholder="Recursos Humanos" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Fondo del login (gradiente)</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {gradients.map(g => (
              <button key={g.value} onClick={() => setSettings(s => ({ ...s, system_login_bg: g.value }))}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                  settings.system_login_bg === g.value ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
                }`}>
                <div className={`w-8 h-6 rounded-lg bg-gradient-to-br ${g.value} flex-shrink-0`} />
                <span className="text-slate-600 text-xs">{g.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Preview */}
        <div className={`rounded-xl bg-gradient-to-br ${settings.system_login_bg} p-4 flex items-center justify-center`} style={{ minHeight: 110 }}>
          <div className="bg-white rounded-2xl p-4 text-center shadow-xl w-44">
            {settings.system_logo_url
              ? <img src={settings.system_logo_url} alt="logo" className="h-8 mx-auto mb-2 object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
              : <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center text-white text-sm"
                  style={{ backgroundColor: settings.system_primary_color }}>🕐</div>
            }
            <p className="text-xs font-bold text-slate-900 leading-tight">{settings.system_login_title || 'Sistema'}</p>
            <p className="text-xs text-slate-400">{settings.system_login_subtitle}</p>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
          saved ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
        }`}>
        <Save size={16} />
        {saving ? 'Guardando...' : saved ? '✓ Guardado correctamente' : 'Guardar cambios'}
      </button>
    </div>
  )
}

// ─── Tab: Relojes ZKTeco ─────────────────────────────────────
function RelojesTab() {
  const [devices, setDevices]       = useState<Device[]>([])
  const [loading, setLoading]       = useState(true)
  const [pinging, setPinging]       = useState(false)
  const [lastCheck, setLastCheck]   = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [form, setForm]             = useState({ name: '', ip_address: '', port: '4370', location: '', serial_no: '' })
  const [saving, setSaving]         = useState(false)
  const [expanded, setExpanded]     = useState<number | null>(null)
  const [deviceTab, setDeviceTab]   = useState<Record<number, 'info'|'usuarios'|'funciones'>>({})
  const [deviceData, setDeviceData] = useState<Record<number, any>>({})
  const [deviceLoading, setDeviceLoading] = useState<Record<number, string>>({})
  const [opLog, setOpLog]           = useState<Record<number, string[]>>({})

  async function loadDevices() {
    setLoading(true)
    try { const r = await api.get('/api/devices'); setDevices(r.data) } catch { setDevices([]) }
    setLoading(false)
  }

  useEffect(() => { loadDevices() }, [])

  async function pingAll() {
    setPinging(true)
    try { const r = await api.get('/api/devices/ping-all'); setDevices(r.data); setLastCheck(new Date().toLocaleTimeString()) } catch {}
    setPinging(false)
  }

  function openAdd() {
    setEditDevice(null); setForm({ name: '', ip_address: '', port: '4370', location: '', serial_no: '' }); setShowForm(true)
  }
  function openEdit(d: Device) {
    setEditDevice(d); setForm({ name: d.name, ip_address: d.ip_address, port: String(d.port), location: d.location || '', serial_no: d.serial_no || '' }); setShowForm(true)
  }
  async function saveDevice() {
    setSaving(true)
    try {
      if (editDevice) await api.put(`/api/devices/${editDevice.id}`, { ...form, port: Number(form.port) })
      else await api.post('/api/devices', { ...form, port: Number(form.port) })
      setShowForm(false); await loadDevices()
    } catch (e: any) { alert('Error: ' + (e.response?.data?.error || e.message)) }
    setSaving(false)
  }
  async function deleteDevice(id: number, name: string) {
    if (!confirm(`¿Eliminar el reloj "${name}"?`)) return
    try { await api.delete(`/api/devices/${id}`); await loadDevices() } catch (e: any) { alert('Error: ' + (e.response?.data?.error || e.message)) }
  }

  function addLog(id: number, msg: string) {
    setOpLog(p => ({ ...p, [id]: [new Date().toLocaleTimeString() + ' — ' + msg, ...(p[id] || [])] }))
  }
  function setBusy(id: number, op: string) { setDeviceLoading(p => ({ ...p, [id]: op })) }

  function getTab(id: number) { return deviceTab[id] || 'info' }
  function setTab(id: number, t: 'info'|'usuarios'|'funciones') { setDeviceTab(p => ({ ...p, [id]: t })) }

  async function loadInfo(d: Device) {
    setBusy(d.id, 'info')
    try {
      const r = await api.get(`/api/devices/${d.id}/info`)
      setDeviceData(p => ({ ...p, [d.id]: { ...p[d.id], info: r.data } }))
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message
      setDeviceData(p => ({ ...p, [d.id]: { ...p[d.id], info: { error: msg } } }))
    }
    setBusy(d.id, '')
  }
  async function loadUsers(d: Device) {
    setBusy(d.id, 'users')
    try {
      const r = await api.get(`/api/devices/${d.id}/users`)
      setDeviceData(p => ({ ...p, [d.id]: { ...p[d.id], users: r.data } }))
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message
      setDeviceData(p => ({ ...p, [d.id]: { ...p[d.id], users: { error: msg } } }))
    }
    setBusy(d.id, '')
  }

  const errMsg = (e: any) => e.response?.data?.error || e.response?.data?.message || e.message

  async function doBackup(d: Device) {
    setBusy(d.id, 'backup'); addLog(d.id, `⬇️ Iniciando backup de "${d.name}"...`)
    try {
      const r = await api.post(`/api/devices/${d.id}/backup`)
      addLog(d.id, `✅ Backup: ${r.data.imported} importados, ${r.data.skipped} omitidos (${r.data.total} total)`)
    } catch (e: any) { addLog(d.id, `❌ Error: ${errMsg(e)}`) }
    setBusy(d.id, '')
  }
  async function doClear(d: Device) {
    if (!confirm(`⚠️ ¿Eliminar TODOS los registros del reloj "${d.name}"? Solo borra del reloj, no de la BD.`)) return
    setBusy(d.id, 'clear'); addLog(d.id, `🗑️ Eliminando registros de "${d.name}"...`)
    try {
      const r = await api.post(`/api/devices/${d.id}/clear`)
      addLog(d.id, `✅ ${r.data.message}`)
    } catch (e: any) { addLog(d.id, `❌ Error: ${errMsg(e)}`) }
    setBusy(d.id, '')
  }
  async function doEnable(d: Device) {
    setBusy(d.id, 'enable'); addLog(d.id, `▶️ Habilitando "${d.name}"...`)
    try { const r = await api.post(`/api/devices/${d.id}/enable`); addLog(d.id, `✅ ${r.data.message}`) }
    catch (e: any) { addLog(d.id, `❌ Error: ${errMsg(e)}`) }
    setBusy(d.id, '')
  }
  async function doDisable(d: Device) {
    if (!confirm(`¿Deshabilitar el reloj "${d.name}"? Los empleados no podrán marcar.`)) return
    setBusy(d.id, 'disable'); addLog(d.id, `⏸️ Deshabilitando "${d.name}"...`)
    try { const r = await api.post(`/api/devices/${d.id}/disable`); addLog(d.id, `✅ ${r.data.message}`) }
    catch (e: any) { addLog(d.id, `❌ Error: ${errMsg(e)}`) }
    setBusy(d.id, '')
  }

  function toggleExpand(id: number) {
    const opening = expanded !== id
    setExpanded(opening ? id : null)
    if (opening) {
      const d = devices.find(x => x.id === id)
      if (d && !deviceData[id]?.info) loadInfo(d)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">Relojes Biométricos ZKTeco</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestión y operaciones directas (puerto 4370)
            {lastCheck && <span className="ml-2 text-slate-400">— verificado a las {lastCheck}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={pingAll} disabled={pinging}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">
            <Activity size={14} className={pinging ? 'animate-pulse text-blue-500' : ''} />
            {pinging ? 'Verificando...' : 'Verificar estado'}
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
            <Plus size={14} /> Agregar reloj
          </button>
        </div>
      </div>

      {/* Formulario add/edit */}
      {showForm && (
        <div className="border border-blue-100 bg-blue-50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-slate-800">{editDevice ? 'Editar reloj' : 'Agregar nuevo reloj'}</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Nombre *</label><input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="ej: Reloj Comedor" className={inputCls} /></div>
            <div><label className={labelCls}>Ubicación</label><input value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))} placeholder="ej: Planta Baja" className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className={labelCls}>Dirección IP *</label><input value={form.ip_address} onChange={e => setForm(f=>({...f,ip_address:e.target.value}))} placeholder="172.16.20.160" className={inputCls} /></div>
            <div><label className={labelCls}>Puerto</label><input value={form.port} onChange={e => setForm(f=>({...f,port:e.target.value}))} placeholder="4370" className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>N° de serie (opcional)</label><input value={form.serial_no} onChange={e => setForm(f=>({...f,serial_no:e.target.value}))} placeholder="ej: ABCD123456" className={inputCls} /></div>
          <div className="flex gap-3">
            <button onClick={saveDevice} disabled={saving || !form.name || !form.ip_address}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
              <Save size={14} /> {saving ? 'Guardando...' : editDevice ? 'Actualizar' : 'Agregar'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="py-8 text-center text-slate-400">Cargando relojes...</div>
      ) : devices.length === 0 ? (
        <div className="py-8 text-center text-slate-400">
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          <p>No hay relojes registrados.</p>
          <button onClick={openAdd} className="mt-3 text-blue-600 text-sm hover:underline">+ Agregar el primer reloj</button>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map(d => {
            const status = d.status || 'unknown'
            const isOpen = expanded === d.id
            const busy   = deviceLoading[d.id] || ''
            const tab    = getTab(d.id)
            const data   = deviceData[d.id] || {}
            const log    = opLog[d.id] || []

            return (
              <div key={d.id} className={`rounded-xl border overflow-hidden ${
                status === 'online' ? 'border-green-200' : status === 'offline' ? 'border-red-200' : 'border-slate-200'
              }`}>
                {/* Cabecera */}
                <div className={`flex items-center gap-4 p-4 ${
                  status === 'online' ? 'bg-green-50' : status === 'offline' ? 'bg-red-50' : 'bg-slate-50'
                }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    status === 'online' ? 'bg-green-100 text-green-600' : status === 'offline' ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {status === 'online' ? <Wifi size={20} /> : <WifiOff size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{d.name}</p>
                    <p className="text-sm font-mono text-slate-500">{d.ip_address}:{d.port}</p>
                    {(d.location || d.serial_no) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {d.location && <span><MapPin size={10} className="inline mr-1"/>{d.location}</span>}
                        {d.serial_no && <span className="ml-2"><Hash size={10} className="inline mr-1"/>{d.serial_no}</span>}
                      </p>
                    )}
                    {d.last_sync && <p className="text-xs text-slate-400">Sync: {new Date(d.last_sync).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full hidden sm:block ${
                      status === 'online' ? 'bg-green-100 text-green-700' : status === 'offline' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {status === 'online' ? '● En línea' : status === 'offline' ? '● Sin conexión' : '● Sin estado'}
                    </span>
                    <button onClick={() => openEdit(d)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={15}/></button>
                    <button onClick={() => deleteDevice(d.id, d.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15}/></button>
                    <button onClick={() => toggleExpand(d.id)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                      {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                    </button>
                  </div>
                </div>

                {/* Panel expandido */}
                {isOpen && (
                  <div className="border-t border-slate-100">
                    {/* Sub-tabs */}
                    <div className="flex border-b border-slate-100 bg-white">
                      {[
                        { id: 'info',     label: '📊 Información',       icon: <Info size={13}/> },
                        { id: 'usuarios', label: '👥 Usuarios',           icon: <Users size={13}/> },
                        { id: 'funciones',label: '⚙️ Funciones avanzadas', icon: <Settings2 size={13}/> },
                      ].map(st => (
                        <button key={st.id} onClick={() => {
                          setTab(d.id, st.id as any)
                          if (st.id === 'info' && !data.info) loadInfo(d)
                          if (st.id === 'usuarios' && !data.users) loadUsers(d)
                        }}
                          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                            tab === st.id ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-700'
                          }`}>
                          {st.label}
                        </button>
                      ))}
                    </div>

                    <div className="p-4 bg-white">
                      {/* TAB: INFORMACIÓN */}
                      {tab === 'info' && (
                        <div className="space-y-4">
                          {/* Header con botón recargar */}
                          {(data.info || deviceLoading[d.id] === 'info') && (
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Información del dispositivo</p>
                              <button onClick={() => loadInfo(d)} disabled={deviceLoading[d.id] === 'info'}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50">
                                <RefreshCw size={11} className={deviceLoading[d.id] === 'info' ? 'animate-spin' : ''}/> Recargar
                              </button>
                            </div>
                          )}

                          {deviceLoading[d.id] === 'info' && !data.info && (
                            <div className="py-6 text-center text-slate-400 text-sm">Leyendo información del reloj...</div>
                          )}

                          {data.info?.error && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-red-600 text-sm">
                              <XCircle size={16} className="flex-shrink-0 mt-0.5"/>
                              <div>
                                <p className="font-medium">No se pudo leer la información</p>
                                <p className="text-xs mt-1 font-mono">{data.info.error}</p>
                              </div>
                            </div>
                          )}

                          {data.info && !data.info.error && (() => {
                            const inf = data.info
                            const fmt = (v: any) => v !== undefined && v !== null ? Number(v).toLocaleString() : '—'
                            const str = (v: any) => v || '—'
                            return (
                              <div className="space-y-4">
                                {/* Sección Información — layout 2 columnas como ZKTeco */}
                                <div className="border border-slate-100 rounded-xl overflow-hidden">
                                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                                    <p className="text-xs font-semibold text-slate-600">Información</p>
                                  </div>
                                  <div className="grid grid-cols-2 divide-x divide-slate-100">
                                    <table className="text-xs w-full">
                                      <tbody className="divide-y divide-slate-50">
                                        {[
                                          ['User Count',         fmt(inf.userCounts)],
                                          ['Fingerprint Count',  fmt(inf.fpCount)],
                                          ['Fingerprint Version',str(inf.fpVersion)],
                                          ['Face Count',         fmt(inf.faceCount)],
                                          ['Face Version',       str(inf.faceVersion)],
                                          ['Manufacture time',   str(inf.manufactureTime)],
                                          ['Serial Number',      str(inf.serialNumber)],
                                        ].map(([label, val]) => (
                                          <tr key={label}>
                                            <td className="px-3 py-1.5 text-slate-500 w-36">{label}</td>
                                            <td className="px-3 py-1.5 text-slate-800 font-medium">{val}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    <table className="text-xs w-full">
                                      <tbody className="divide-y divide-slate-50">
                                        {[
                                          ['Password count',     fmt(inf.pwdCount)],
                                          ['Log Count',          fmt(inf.logCounts)],
                                          ['Super log count',    fmt(inf.superLogCount)],
                                          ['Administrator Count',fmt(inf.adminCount)],
                                          ['Product Name',       str(inf.productName)],
                                          ['Firmware version',   str(inf.firmwareVersion)],
                                          ['Platform',           str(inf.platform)],
                                        ].map(([label, val]) => (
                                          <tr key={label}>
                                            <td className="px-3 py-1.5 text-slate-500 w-36">{label}</td>
                                            <td className="px-3 py-1.5 text-slate-800 font-medium">{val}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Sección Capacity */}
                                <div className="border border-slate-100 rounded-xl overflow-hidden">
                                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                                    <p className="text-xs font-semibold text-slate-600">Capacity</p>
                                  </div>
                                  <div className="grid grid-cols-4 text-xs divide-x divide-slate-100">
                                    {[
                                      ['User',        inf.userCapacity],
                                      ['Fingerprint', inf.fpCapacity],
                                      ['Log',         inf.logCapacity],
                                      ['Face',        inf.faceCapacity ?? 0],
                                    ].map(([label, val]) => (
                                      <div key={String(label)} className="px-4 py-3 text-center">
                                        <p className="text-slate-500 mb-1">{label}</p>
                                        <p className="text-base font-bold text-slate-800">{val !== undefined && Number(val) > 0 ? Number(val).toLocaleString() : '—'}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Debug: buffer raw (quitar cuando se confirmen los offsets) */}
                                {inf._rawOffsets && (
                                  <details className="border border-slate-100 rounded-xl overflow-hidden">
                                    <summary className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 cursor-pointer">
                                      🔍 Buffer raw (debug — click para expandir)
                                    </summary>
                                    <div className="grid grid-cols-4 gap-1 p-3 font-mono text-xs max-h-48 overflow-y-auto bg-slate-50">
                                      {(inf._rawOffsets as [number,number][]).filter(([,v]) => v > 0).map(([offset, val]) => (
                                        <div key={offset} className="flex gap-1">
                                          <span className="text-slate-400 w-7">[{offset}]</span>
                                          <span className="text-slate-700 font-medium">{val.toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            )
                          })()}

                          {!deviceLoading[d.id] && !data.info && (
                            <button onClick={() => loadInfo(d)} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                              <RefreshCw size={14}/> Cargar información del reloj
                            </button>
                          )}
                        </div>
                      )}

                      {/* TAB: USUARIOS */}
                      {tab === 'usuarios' && (
                        <div>
                          {deviceLoading[d.id] === 'users' && (
                            <div className="py-6 text-center text-slate-400 text-sm">Leyendo usuarios del reloj...</div>
                          )}
                          {data.users?.error && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-red-600 text-sm">
                              <XCircle size={16} className="flex-shrink-0 mt-0.5"/>
                              <div>
                                <p className="font-medium">No se pudo leer los usuarios</p>
                                <p className="text-xs mt-0.5">{data.users.error}</p>
                              </div>
                            </div>
                          )}
                          {data.users?.users && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-sm text-slate-600 font-medium">
                                  {data.users.total} usuario{data.users.total !== 1 ? 's' : ''} registrado{data.users.total !== 1 ? 's' : ''}
                                </p>
                                <button onClick={() => loadUsers(d)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                  <RefreshCw size={12}/> Actualizar
                                </button>
                              </div>
                              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                      <th className="text-left px-3 py-2 text-slate-500 font-medium">ID Reloj</th>
                                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Nombre</th>
                                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Rol</th>
                                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Grupo</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {data.users.users.map((u: any, i: number) => (
                                      <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-mono text-slate-700">{u.userId}</td>
                                        <td className="px-3 py-2 text-slate-800">{u.name || <span className="text-slate-400 italic">sin nombre</span>}</td>
                                        <td className="px-3 py-2">
                                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${u.privilege === 14 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {u.privilege === 14 ? 'Admin' : 'Usuario'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">{u.groupId || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {!deviceLoading[d.id] && !data.users && (
                            <button onClick={() => loadUsers(d)} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                              <RefreshCw size={14}/> Cargar usuarios
                            </button>
                          )}
                        </div>
                      )}

                      {/* TAB: FUNCIONES AVANZADAS */}
                      {tab === 'funciones' && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 border border-slate-100 rounded-xl space-y-2">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos</p>
                              <button onClick={() => doBackup(d)} disabled={!!busy}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 justify-center">
                                <Download size={14} className={busy === 'backup' ? 'animate-bounce' : ''}/>
                                {busy === 'backup' ? 'Haciendo backup...' : 'Backup → BD'}
                              </button>
                              <button onClick={() => doClear(d)} disabled={!!busy}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border border-red-200 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-50 justify-center">
                                <Eraser size={14} className={busy === 'clear' ? 'animate-bounce' : ''}/>
                                {busy === 'clear' ? 'Eliminando...' : 'Limpiar registros'}
                              </button>
                            </div>
                            <div className="p-4 border border-slate-100 rounded-xl space-y-2">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dispositivo</p>
                              <button onClick={() => doEnable(d)} disabled={!!busy}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border border-green-200 text-green-700 rounded-xl hover:bg-green-50 disabled:opacity-50 justify-center">
                                <Power size={14} className={busy === 'enable' ? 'animate-pulse' : ''}/>
                                {busy === 'enable' ? 'Habilitando...' : 'Habilitar reloj'}
                              </button>
                              <button onClick={() => doDisable(d)} disabled={!!busy}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border border-amber-200 text-amber-700 rounded-xl hover:bg-amber-50 disabled:opacity-50 justify-center">
                                <PowerOff size={14} className={busy === 'disable' ? 'animate-pulse' : ''}/>
                                {busy === 'disable' ? 'Deshabilitando...' : 'Deshabilitar reloj'}
                              </button>
                            </div>
                          </div>

                          {log.length > 0 && (
                            <div className="bg-slate-900 rounded-xl p-3 font-mono text-xs text-green-400 space-y-0.5 max-h-40 overflow-y-auto">
                              {log.map((line, i) => <div key={i}>{line}</div>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 space-y-1">
        <p className="font-medium">Operaciones directas</p>
        <p><strong>Backup → BD:</strong> lee todos los marcajes del reloj e importa los nuevos a la base de datos.</p>
        <p><strong>Limpiar registros:</strong> borra marcajes del reloj (no de la BD) para liberar memoria del dispositivo.</p>
      </div>
    </div>
  )
}

// ─── Tab: Sincronización BD ───────────────────────────────────
interface ConnResult {
  ok: boolean; totalRecords?: number; totalEmployees?: number
  machines?: { MACHINE_ALIAS: string; IP_ADDRESS: string }[]
  recentRecords?: { USERID: number; nombre: string; CHECKTIME: string; CHECKTYPE: string }[]
  error?: string
}

function SyncTab() {
  const [log, setLog]           = useState<string[]>([])
  const [testing, setTesting]   = useState(false)
  const [syncing, setSyncing]   = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [saved, setSaved]       = useState(false)
  const [connResult, setConnResult] = useState<ConnResult | null>(null)

  const today    = new Date().toISOString().split('T')[0]
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(firstDay)
  const [dateTo, setDateTo]     = useState(today)

  const [conn, setConn] = useState<DbConn>(defaultConn)
  useEffect(() => { setConn(loadConn()) }, [])

  const addLog   = (msg: string) => setLog(prev => [new Date().toLocaleTimeString() + ' — ' + msg, ...prev])
  const setField = (k: keyof DbConn) => (e: React.ChangeEvent<HTMLInputElement>) => setConn(c => ({ ...c, [k]: e.target.value }))

  function saveConn() {
    localStorage.setItem(CONN_KEY, JSON.stringify(conn))
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function testConnection() {
    setTesting(true); setConnResult(null)
    addLog(`🔌 Probando conexión a ${conn.host}:${conn.port}/${conn.database}...`)
    try {
      const r = await api.post('/api/sync/test-conn', conn)
      setConnResult(r.data)
      addLog(r.data.ok
        ? `✅ Conexión exitosa — ${r.data.totalRecords?.toLocaleString()} marcajes, ${r.data.totalEmployees?.toLocaleString()} empleados`
        : `❌ Error: ${r.data.error}`)
    } catch (e: any) {
      const err = e.response?.data?.error || e.message
      setConnResult({ ok: false, error: err })
      addLog(`❌ Error: ${err}`)
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-slate-800">Sincronización con Base de Datos Externa</h2>
        <p className="text-sm text-slate-500 mt-0.5">Importa empleados y marcajes desde SQL Server</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Columna izquierda: Configuración */}
        <div className="space-y-4">
          <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Server size={16} className="text-blue-600" />
              <h3 className="font-medium text-slate-800">Configuración de Conexión</h3>
            </div>
            <div>
              <label className={labelCls}>Nombre / Etiqueta</label>
              <input value={conn.label} onChange={setField('label')} placeholder="ej: ZKTeco Attendance Management" className={inputCls} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Host / IP del servidor</label>
                <input value={conn.host} onChange={setField('host')} placeholder="ej: 10.81.28.8" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Puerto</label>
                <input value={conn.port} onChange={setField('port')} placeholder="1433" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Base de Datos</label>
              <input value={conn.database} onChange={setField('database')} placeholder="att2000" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Usuario</label>
                <input value={conn.user} onChange={setField('user')} placeholder="sa" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Contraseña</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={conn.password} onChange={setField('password')}
                    placeholder="••••••••" className={inputCls + ' pr-10'} />
                  <button onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Período */}
          <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-blue-600" />
              <h3 className="font-medium text-slate-800">Período a Sincronizar</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Desde</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Hasta</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} /></div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-3 flex-wrap">
            <button onClick={saveConn}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                saved ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-800 text-white hover:bg-slate-700'
              }`}>
              <Save size={16}/>{saved ? '✓ Guardado' : 'Guardar'}
            </button>
            <button onClick={testConnection} disabled={testing || !conn.host}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-50">
              <Zap size={16} className="text-yellow-500"/>
              {testing ? 'Probando...' : 'Probar conexión'}
            </button>
            <button onClick={runSync} disabled={syncing || !conn.host}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''}/>
              {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </button>
          </div>
        </div>

        {/* Columna derecha: Resultado de la conexión */}
        <div className="space-y-4">
          {!connResult && (
            <div className="border border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center text-slate-400 h-full min-h-48">
              <Database size={32} className="mb-3 opacity-30"/>
              <p className="text-sm">Haz clic en <strong className="text-slate-600">Probar conexión</strong> para ver la información de la base de datos</p>
            </div>
          )}
          {connResult && !connResult.ok && (
            <div className="border border-red-200 bg-red-50 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <XCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="font-semibold text-red-700">Error de conexión</p>
                  <p className="text-sm text-red-600 mt-1">{connResult.error}</p>
                </div>
              </div>
            </div>
          )}
          {connResult?.ok && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-green-100 bg-green-50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={14} className="text-green-600"/>
                    <span className="text-xs text-green-700 font-medium">Marcajes totales</span>
                  </div>
                  <p className="text-2xl font-bold text-green-800">{connResult.totalRecords?.toLocaleString()}</p>
                </div>
                <div className="border border-blue-100 bg-blue-50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={14} className="text-blue-600"/>
                    <span className="text-xs text-blue-700 font-medium">Empleados</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-800">{connResult.totalEmployees?.toLocaleString()}</p>
                </div>
              </div>

              {/* Relojes */}
              {connResult.machines && connResult.machines.length > 0 && (
                <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock size={12}/> Relojes en la base de datos
                  </p>
                  {connResult.machines.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <Wifi size={13} className="text-green-500 flex-shrink-0"/>
                      <span className="text-slate-700 font-medium">{m.MACHINE_ALIAS}</span>
                      <span className="font-mono text-slate-400 text-xs">{m.IP_ADDRESS}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Últimas marcadas */}
              {connResult.recentRecords && connResult.recentRecords.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Últimas marcadas registradas</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium">ID</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium">Nombre</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium">Fecha/Hora</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {connResult.recentRecords.map((rec, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5 font-mono text-slate-600">{rec.USERID}</td>
                            <td className="px-3 py-1.5 text-slate-800">{rec.nombre || <span className="text-slate-400 italic">—</span>}</td>
                            <td className="px-3 py-1.5 text-slate-500">{new Date(rec.CHECKTIME).toLocaleString()}</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${rec.CHECKTYPE === 'I' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                {rec.CHECKTYPE === 'I' ? 'Entrada' : 'Salida'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {log.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1 max-h-48 overflow-y-auto">
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
  const [form, setForm] = useState({ name: '', url: '', secret: '', events: ['attendance.checkin','attendance.checkout','alert.late'] })

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
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">
          <Plus size={16}/> Agregar
        </button>
      </div>
      {showForm && (
        <div className="border border-blue-100 bg-blue-50 rounded-xl p-5 space-y-3">
          <h3 className="font-medium text-slate-700">Nuevo Webhook</h3>
          {['name','url','secret'].map(field => (
            <input key={field}
              placeholder={field === 'name' ? 'Nombre' : field === 'url' ? 'URL del endpoint' : 'Secreto HMAC (opcional)'}
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
        {(webhooks as Webhook[]).length === 0 && <p className="text-center py-8 text-slate-400 text-sm">No hay webhooks registrados.</p>}
        {(webhooks as Webhook[]).map(wh => (
          <div key={wh.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100">
            <Globe size={20} className="text-blue-500 flex-shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">{wh.name}</p>
              <p className="text-sm text-slate-500 truncate">{wh.url}</p>
            </div>
            <div className="flex items-center gap-2">
              {wh.last_status === 200 ? <CheckCircle size={16} className="text-green-500"/> :
               wh.last_status > 0 ? <XCircle size={16} className="text-red-500"/> :
               <AlertCircle size={16} className="text-slate-400"/>}
              <button onClick={() => deleteWebhook(wh.id)} className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                <Trash2 size={14}/>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: API ─────────────────────────────────────────────────
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
            <span className={`px-2 py-0.5 rounded font-bold text-xs ${e.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{e.method}</span>
            <span className="text-slate-700 flex-1">{e.path}</span>
            <span className="text-slate-400 text-xs font-sans">{e.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
