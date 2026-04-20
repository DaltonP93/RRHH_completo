'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Palette, Upload, Save, RotateCcw, Image as ImageIcon,
  Eye, Monitor, Type, Clock as ClockIcon, CheckCircle, AlertCircle
} from 'lucide-react'
import { api } from '@/lib/api'

interface Settings {
  system_name: string
  system_company: string
  system_logo_url: string
  system_favicon_url: string
  system_login_bg: string
  system_login_bg_image: string
  system_login_title: string
  system_login_subtitle: string
  system_login_layout: string
  system_login_show_datetime: string
  system_login_glass: string
  system_login_footer: string
  system_primary_color: string
  system_secondary_color: string
  system_accent_color: string
  system_sidebar_bg: string
  system_sidebar_text: string
  system_sidebar_active: string
  system_theme_mode: string
  system_font_family: string
  system_border_radius: string
  system_date_format: string
  system_time_format: string
  system_timezone: string
  system_locale: string
  employee_display_mode: string
}

const GRADIENTS = [
  { id: 'from-slate-900 to-blue-900',   label: 'Azul noche' },
  { id: 'from-indigo-900 to-purple-900', label: 'Índigo' },
  { id: 'from-emerald-800 to-teal-700',  label: 'Esmeralda' },
  { id: 'from-rose-800 to-pink-700',     label: 'Rosa' },
  { id: 'from-amber-700 to-orange-700',  label: 'Ámbar' },
  { id: 'from-slate-800 to-slate-900',   label: 'Gris oscuro' },
]

const FONTS   = ['Inter', 'Roboto', 'Poppins', 'Nunito', 'Montserrat', 'System UI']
const RADIUS  = [{ id: 'sm', label: 'Pequeño' }, { id: 'md', label: 'Medio' }, { id: 'lg', label: 'Grande' }, { id: 'xl', label: 'Extra grande' }]
const LAYOUTS = [{ id: 'center', label: 'Centrado' }, { id: 'left', label: 'Izquierda' }, { id: 'right', label: 'Derecha' }]

export default function AparienciaPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const logoRef    = useRef<HTMLInputElement>(null)
  const faviconRef = useRef<HTMLInputElement>(null)
  const bgRef      = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await api.get('/api/settings')
    setS(data)
  }
  useEffect(() => { load() }, [])

  function patch(p: Partial<Settings>) {
    setS(prev => prev ? { ...prev, ...p } : prev)
  }

  async function save() {
    if (!s) return
    setSaving(true); setMsg(null)
    try {
      await api.put('/api/settings', s)
      setMsg({ kind: 'ok', text: 'Cambios guardados' })
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.response?.data?.error || e.message })
    } finally { setSaving(false) }
  }

  async function reset() {
    if (!confirm('Restaurar apariencia a valores por defecto?')) return
    try {
      await api.post('/api/settings/reset')
      await load()
      setMsg({ kind: 'ok', text: 'Valores por defecto restaurados' })
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.response?.data?.error || e.message })
    }
  }

  async function upload(kind: 'logo'|'favicon'|'login_bg', file: File) {
    const fd = new FormData()
    fd.append('file', file)
    setMsg(null)
    try {
      const { data } = await api.post(`/api/settings/upload?kind=${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setMsg({ kind: 'ok', text: `Archivo subido: ${data.filename}` })
      await load()
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.response?.data?.error || e.message })
    }
  }

  if (!s) return <div className="p-6 text-slate-400">Cargando...</div>

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  function fullUrl(u: string): string {
    if (!u) return ''
    if (u.startsWith('http')) return u
    return apiUrl + u
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/configuracion" className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Palette size={26} className="text-purple-500" /> Apariencia
            </h1>
            <p className="text-slate-500 text-sm">
              Personalizá marca, colores, login y UI. Los cambios aplican a todos los usuarios.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm">
            <RotateCcw size={16} /> Restaurar
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60">
            <Save size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ Editores ═══ */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identidad */}
          <Card title="🏢 Identidad de marca">
            <Grid2>
              <Field label="Nombre del sistema">
                <input className={input} value={s.system_name}
                  onChange={e => patch({ system_name: e.target.value })} />
              </Field>
              <Field label="Empresa">
                <input className={input} value={s.system_company}
                  onChange={e => patch({ system_company: e.target.value })} />
              </Field>
            </Grid2>

            <Grid3>
              <UploadField label="Logo" url={s.system_logo_url} apiUrl={apiUrl}
                onPick={f => upload('logo', f)} inputRef={logoRef}
                onUrlChange={v => patch({ system_logo_url: v })} />
              <UploadField label="Favicon" url={s.system_favicon_url} apiUrl={apiUrl}
                onPick={f => upload('favicon', f)} inputRef={faviconRef}
                onUrlChange={v => patch({ system_favicon_url: v })} />
              <UploadField label="Fondo de login" url={s.system_login_bg_image} apiUrl={apiUrl}
                onPick={f => upload('login_bg', f)} inputRef={bgRef}
                onUrlChange={v => patch({ system_login_bg_image: v })} />
            </Grid3>
          </Card>

          {/* Colores */}
          <Card title="🎨 Colores del tema">
            <Grid3>
              <ColorField label="Primario"   value={s.system_primary_color}   onChange={v => patch({ system_primary_color: v })} />
              <ColorField label="Secundario" value={s.system_secondary_color} onChange={v => patch({ system_secondary_color: v })} />
              <ColorField label="Acento"     value={s.system_accent_color}    onChange={v => patch({ system_accent_color: v })} />
            </Grid3>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4">Sidebar</h3>
            <Grid3>
              <ColorField label="Fondo"  value={s.system_sidebar_bg}     onChange={v => patch({ system_sidebar_bg: v })} />
              <ColorField label="Texto"  value={s.system_sidebar_text}   onChange={v => patch({ system_sidebar_text: v })} />
              <ColorField label="Activo" value={s.system_sidebar_active} onChange={v => patch({ system_sidebar_active: v })} />
            </Grid3>
          </Card>

          {/* Tipografía y forma */}
          <Card title="🔤 Tipografía y forma">
            <Grid3>
              <Field label="Familia tipográfica">
                <select className={input} value={s.system_font_family}
                  onChange={e => patch({ system_font_family: e.target.value })}>
                  {FONTS.map(f => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Radio de bordes">
                <select className={input} value={s.system_border_radius}
                  onChange={e => patch({ system_border_radius: e.target.value })}>
                  {RADIUS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Modo">
                <select className={input} value={s.system_theme_mode}
                  onChange={e => patch({ system_theme_mode: e.target.value })}>
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro (próximamente)</option>
                  <option value="auto">Automático (próximamente)</option>
                </select>
              </Field>
            </Grid3>
          </Card>

          {/* Login */}
          <Card title="🔐 Pantalla de login">
            <Grid2>
              <Field label="Título">
                <input className={input} value={s.system_login_title}
                  onChange={e => patch({ system_login_title: e.target.value })} />
              </Field>
              <Field label="Subtítulo">
                <input className={input} value={s.system_login_subtitle}
                  onChange={e => patch({ system_login_subtitle: e.target.value })} />
              </Field>
            </Grid2>
            <Grid3>
              <Field label="Layout">
                <select className={input} value={s.system_login_layout}
                  onChange={e => patch({ system_login_layout: e.target.value })}>
                  {LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </Field>
              <Field label="Gradient (sin imagen)">
                <select className={input} value={s.system_login_bg}
                  onChange={e => patch({ system_login_bg: e.target.value })}>
                  {GRADIENTS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </Field>
              <Field label="Pie de página">
                <input className={input} value={s.system_login_footer}
                  onChange={e => patch({ system_login_footer: e.target.value })}
                  placeholder="Texto libre" />
              </Field>
            </Grid2>
            <div className="flex flex-wrap gap-4">
              <Toggle label="Mostrar fecha y hora"
                on={s.system_login_show_datetime === '1'}
                onChange={v => patch({ system_login_show_datetime: v ? '1' : '0' })} />
              <Toggle label="Efecto glassmorphism"
                on={s.system_login_glass === '1'}
                onChange={v => patch({ system_login_glass: v ? '1' : '0' })} />
            </div>
          </Card>

          {/* Formato regional */}
          <Card title="🌎 Formato regional">
            <Grid3>
              <Field label="Idioma / Locale">
                <select className={input} value={s.system_locale}
                  onChange={e => patch({ system_locale: e.target.value })}>
                  <option value="es-PY">Español (PY)</option>
                  <option value="es-ES">Español (ES)</option>
                  <option value="es-AR">Español (AR)</option>
                  <option value="en-US">English (US)</option>
                  <option value="pt-BR">Português (BR)</option>
                </select>
              </Field>
              <Field label="Formato de fecha">
                <select className={input} value={s.system_date_format}
                  onChange={e => patch({ system_date_format: e.target.value })}>
                  <option>DD/MM/YYYY</option><option>YYYY-MM-DD</option><option>MM/DD/YYYY</option>
                </select>
              </Field>
              <Field label="Formato de hora">
                <select className={input} value={s.system_time_format}
                  onChange={e => patch({ system_time_format: e.target.value })}>
                  <option value="24h">24 horas</option>
                  <option value="12h">12 horas (AM/PM)</option>
                </select>
              </Field>
            </Grid3>
            <Field label="Modo de nombre de empleado (en tablas)">
              <select className={input} value={s.employee_display_mode}
                onChange={e => patch({ employee_display_mode: e.target.value })}>
                <option value="full_name">Solo nombre completo</option>
                <option value="code_name">Código + nombre</option>
                <option value="code_only">Solo código</option>
              </select>
            </Field>
          </Card>
        </div>

        {/* ═══ Live Preview ═══ */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <Eye size={14} /> Vista previa
            </h2>

            {/* Preview login */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="text-xs text-slate-400 px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
                <Monitor size={12} /> Login
              </div>
              <div
                className={`h-72 relative flex items-center justify-center p-4 ${!s.system_login_bg_image ? `bg-gradient-to-br ${s.system_login_bg}` : ''}`}
                style={s.system_login_bg_image ? {
                  backgroundImage: `url("${fullUrl(s.system_login_bg_image)}")`,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                } : undefined}
              >
                {s.system_login_bg_image && <div className="absolute inset-0 bg-black/30" />}
                <div className={`relative z-10 rounded-2xl p-4 w-full max-w-[200px] text-center ${s.system_login_glass === '1' ? 'bg-white/85 backdrop-blur' : 'bg-white'}`}>
                  {s.system_logo_url
                    ? <img src={fullUrl(s.system_logo_url)} alt="" className="h-8 mx-auto mb-1 object-contain" />
                    : <div className="w-8 h-8 rounded-lg mx-auto mb-1"
                        style={{ background: `linear-gradient(135deg, ${s.system_primary_color}, ${s.system_secondary_color})` }} />
                  }
                  <p className="text-[10px] font-bold text-slate-900 truncate">{s.system_login_title}</p>
                  <p className="text-[9px] text-slate-500 truncate">{s.system_login_subtitle}</p>
                  <div className="h-4 bg-slate-100 rounded mt-2" />
                  <div className="h-4 bg-slate-100 rounded mt-1" />
                  <div className="h-5 rounded mt-2"
                    style={{ background: `linear-gradient(135deg, ${s.system_primary_color}, ${s.system_secondary_color})` }} />
                </div>
              </div>
            </div>

            {/* Preview sidebar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="text-xs text-slate-400 px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
                <Monitor size={12} /> Sidebar
              </div>
              <div className="p-3" style={{ backgroundColor: s.system_sidebar_bg }}>
                {['Dashboard','Empleados','Reportes'].map((l, i) => (
                  <div key={l}
                    className="px-3 py-2 rounded-lg text-sm mb-1"
                    style={i === 0
                      ? { backgroundColor: s.system_sidebar_active, color: '#fff' }
                      : { color: s.system_sidebar_text }}>
                    {l}
                  </div>
                ))}
              </div>
            </div>

            {/* Palette chips */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex gap-2">
              {[s.system_primary_color, s.system_secondary_color, s.system_accent_color].map((c, i) => (
                <div key={i} className="flex-1 h-10 rounded-lg border border-slate-100" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────
const input = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  )
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
      {children}
    </div>
  )
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)}
          className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className={input + ' flex-1 font-mono text-xs'} />
      </div>
    </Field>
  )
}
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <button type="button"
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-blue-500' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      {label}
    </label>
  )
}
function UploadField({ label, url, apiUrl, onPick, inputRef, onUrlChange }: {
  label: string; url: string; apiUrl: string; onPick: (f: File) => void
  inputRef: React.RefObject<HTMLInputElement>; onUrlChange: (v: string) => void
}) {
  let fullUrl = ''
  if (url) fullUrl = url.startsWith('http') ? url : apiUrl + url
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <div className="w-12 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
          {fullUrl
            ? <img src={fullUrl} alt="" className="w-full h-full object-contain" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
            : <ImageIcon size={14} className="text-slate-300" />}
        </div>
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs whitespace-nowrap">
          <Upload size={12} /> Subir
        </button>
        <input ref={inputRef} type="file" className="hidden"
          accept="image/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); if (inputRef.current) inputRef.current.value = '' }} />
      </div>
      <input type="text" value={url} onChange={e => onUrlChange(e.target.value)}
        className={input + ' mt-1 text-xs'} placeholder="/uploads/archivo.png ó URL" />
    </Field>
  )
}
