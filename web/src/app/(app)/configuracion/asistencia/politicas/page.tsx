'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  Plus, Edit2, Trash2, Save, X, CheckCircle, AlertTriangle,
  Clock, Shield, Users, Building2, Globe, RefreshCw
} from 'lucide-react'

interface WorkPolicy {
  id: number | null
  name: string
  scope_type: 'global' | 'company' | 'branch' | 'department' | 'employee'
  scope_id: number | null
  auto_deduct_break: boolean
  break_minutes: number
  apply_break_after_minutes: number
  require_lunch_punch: boolean
  allow_continuous_shift: boolean
  max_daily_minutes: number
  min_daily_minutes: number
  active: boolean
  source?: string
}

const EMPTY_POLICY: WorkPolicy = {
  id: null, name: '', scope_type: 'global', scope_id: null,
  auto_deduct_break: false, break_minutes: 60, apply_break_after_minutes: 360,
  require_lunch_punch: false, allow_continuous_shift: true,
  max_daily_minutes: 720, min_daily_minutes: 0, active: true,
}

const SCOPE_LABELS: Record<string, string> = {
  global: 'Global', company: 'Empresa', branch: 'Sucursal',
  department: 'Departamento', employee: 'Empleado',
}
const SCOPE_ICON: Record<string, React.ReactNode> = {
  global:     <Globe className="w-4 h-4" />,
  company:    <Building2 className="w-4 h-4" />,
  branch:     <Building2 className="w-4 h-4" />,
  department: <Users className="w-4 h-4" />,
  employee:   <Users className="w-4 h-4" />,
}

function minsToLabel(mins: number): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none ${checked ? 'bg-emerald-500' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

function PolicyForm({ policy, onSave, onCancel }: {
  policy: WorkPolicy
  onSave: (p: WorkPolicy) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<WorkPolicy>({ ...policy })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const set = (key: keyof WorkPolicy, value: unknown) => setForm(f => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setSaving(true); setError(null)
    try { await onSave(form) } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ?? (e as {message?: string})?.message ?? 'Error')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{form.id ? 'Editar política' : 'Nueva política'}</h3>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Nombre de la política *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="ej: Jornada corrida turno mañana" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Ámbito</label>
          <select value={form.scope_type} onChange={e => set('scope_type', e.target.value as WorkPolicy['scope_type'])}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {Object.entries(SCOPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {form.scope_type !== 'global' && form.scope_type !== 'company' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">ID de {SCOPE_LABELS[form.scope_type]}</label>
            <input type="number" value={form.scope_id ?? ''} onChange={e => set('scope_id', e.target.value ? +e.target.value : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="ID numérico" />
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reglas de jornada</p>

        <Toggle checked={form.allow_continuous_shift} onChange={v => set('allow_continuous_shift', v)}
          label="Permitir jornada corrida (2 marcaciones sin almuerzo)" />

        <Toggle checked={form.require_lunch_punch} onChange={v => set('require_lunch_punch', v)}
          label="Requerir marcación de almuerzo (emite anomalía si falta)" />

        <div className="border-t border-gray-100 pt-3">
          <Toggle checked={form.auto_deduct_break} onChange={v => set('auto_deduct_break', v)}
            label="Descontar almuerzo automáticamente (si no hay marcaciones de almuerzo)" />

          {form.auto_deduct_break && (
            <div className="mt-3 ml-11 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Minutos a descontar</label>
                <input type="number" min={0} max={240} value={form.break_minutes}
                  onChange={e => set('break_minutes', +e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Aplicar si jornada ≥ (min)</label>
                <input type="number" min={0} value={form.apply_break_after_minutes}
                  onChange={e => set('apply_break_after_minutes', +e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="0 = siempre" />
                <p className="text-xs text-gray-400 mt-1">{form.apply_break_after_minutes > 0 ? minsToLabel(form.apply_break_after_minutes) : 'siempre'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Máximo minutos diarios</label>
          <input type="number" min={0} value={form.max_daily_minutes}
            onChange={e => set('max_daily_minutes', +e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <p className="text-xs text-gray-400 mt-1">{minsToLabel(form.max_daily_minutes)}</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mínimo minutos diarios</label>
          <input type="number" min={0} value={form.min_daily_minutes}
            onChange={e => set('min_daily_minutes', +e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      <Toggle checked={form.active} onChange={v => set('active', v)} label="Política activa" />

      <div className="flex gap-3 pt-2">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function PolicyCard({ policy, onEdit, onDelete }: {
  policy: WorkPolicy; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!policy.active ? 'opacity-60' : 'border-gray-200'}`}>
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{SCOPE_ICON[policy.scope_type]}</span>
          <div>
            <p className="text-sm font-semibold text-gray-800">{policy.name}</p>
            <p className="text-xs text-gray-500">
              {SCOPE_LABELS[policy.scope_type]}
              {policy.scope_id ? ` #${policy.scope_id}` : ''}
              {!policy.active && ' — inactiva'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          {policy.id !== 1 && (
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Rule ok={policy.allow_continuous_shift} label="Jornada corrida" />
        <Rule ok={policy.auto_deduct_break} label={
          policy.auto_deduct_break
            ? `Descuento ${policy.break_minutes}min${policy.apply_break_after_minutes ? ` si ≥ ${minsToLabel(policy.apply_break_after_minutes)}` : ''}`
            : 'Sin descuento automático'
        } />
        <Rule ok={policy.require_lunch_punch} label="Requiere marcación almuerzo" />
        <div className="text-gray-500">
          <span className="font-medium text-gray-700">Max:</span> {minsToLabel(policy.max_daily_minutes)}
        </div>
      </div>
    </div>
  )
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${ok ? 'text-emerald-700' : 'text-gray-400'}`}>
      {ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </div>
  )
}

export default function PoliticasPage() {
  const [policies, setPolicies] = useState<WorkPolicy[]>([])
  const [loading,  setLoading]  = useState(true)
  const [form,     setForm]     = useState<WorkPolicy | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await api.get('/api/attendance/policies')
      setPolicies(data.data ?? [])
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (e as { message?: string })?.message ?? 'Error al cargar')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (p: WorkPolicy) => {
    const method = p.id ? api.put : api.post
    const url    = p.id ? `/api/attendance/policies/${p.id}` : '/api/attendance/policies'
    await method(url, p)
    await load()
    setForm(null)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta política?')) return
    try {
      await api.delete(`/api/attendance/policies/${id}`)
      await load()
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al eliminar')
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Políticas de Jornada</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configura reglas de almuerzo y jornada por empleado, departamento o global
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!form && (
            <button onClick={() => setForm({ ...EMPTY_POLICY })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              <Plus className="w-4 h-4" /> Nueva política
            </button>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <Shield className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          <p className="font-medium">Resolución de política (de más a menos específica)</p>
          <p className="text-xs mt-1 text-blue-700">Empleado → Departamento → Sucursal → Empresa → Global.
            Si no hay política, se usa el default seguro: sin descuento automático de almuerzo.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Formulario */}
      {form && (
        <PolicyForm policy={form} onSave={handleSave} onCancel={() => setForm(null)} />
      )}

      {/* Lista */}
      {loading && !policies.length ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Sin políticas configuradas</p>
          <p className="text-xs mt-1">La política default no descuenta almuerzo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map(p => (
            <PolicyCard key={p.id}
              policy={p}
              onEdit={() => setForm({ ...p })}
              onDelete={() => p.id && handleDelete(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
