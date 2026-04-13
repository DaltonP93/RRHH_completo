'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, Plus, CheckCircle, XCircle, Clock } from 'lucide-react'
import { api, employeesApi } from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────
interface Permission {
  id: number
  employee_id: number
  employee_name: string
  department: string
  type: string
  date_from: string
  date_to: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  approved_by_name?: string
}

const TYPE_LABELS: Record<string, string> = {
  vacation:   'Vacaciones',
  sick:       'Enfermedad',
  personal:   'Personal',
  maternity:  'Maternidad',
  paternity:  'Paternidad',
  other:      'Otro',
}

const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: 'Pendiente',  cls: 'bg-amber-50  text-amber-700',  icon: <Clock size={13} />        },
  approved: { label: 'Aprobado',   cls: 'bg-green-50  text-green-700',  icon: <CheckCircle size={13} />  },
  rejected: { label: 'Rechazado',  cls: 'bg-red-50    text-red-700',    icon: <XCircle size={13} />      },
}

// ─── Modal nuevo permiso ──────────────────────────────────────────
function NuevoPermisoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    employee_id: '', type: 'personal', date_from: format(new Date(), 'yyyy-MM-dd'),
    date_to: format(new Date(), 'yyyy-MM-dd'), reason: '',
  })
  const [saving, setSaving] = useState(false)

  const { data: empsData } = useQuery({
    queryKey: ['employees-select'],
    queryFn: () => employeesApi.list({ limit: 500, status: 'active' }),
    staleTime: 60_000,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/api/permissions', {
        ...form,
        employee_id: +form.employee_id,
      })
      qc.invalidateQueries({ queryKey: ['permissions'] })
      onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al crear permiso')
    } finally {
      setSaving(false)
    }
  }

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-5">Nuevo Permiso / Ausencia</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empleado <span className="text-red-500">*</span></label>
            <select
              required
              value={form.employee_id}
              onChange={e => set('employee_id', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar...</option>
              {(empsData?.data || []).map((emp: any) => (
                <option key={emp.id} value={emp.id}>[{emp.code}] {emp.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Desde</label>
              <input type="date" required value={form.date_from} onChange={e => set('date_from', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hasta</label>
              <input type="date" required value={form.date_to} min={form.date_from}
                onChange={e => set('date_to', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo</label>
            <textarea
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Descripción del permiso..."
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Guardando...' : 'Crear permiso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export default function PermisosPage() {
  const qc = useQueryClient()
  const [showModal, setModal] = useState(false)
  const [filter, setFilter]   = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  const { data, isLoading } = useQuery<Permission[]>({
    queryKey: ['permissions'],
    queryFn: () => api.get('/api/permissions').then(r => r.data),
    staleTime: 30_000,
  })

  async function approve(id: number) {
    await api.patch(`/api/permissions/${id}/approve`)
    qc.invalidateQueries({ queryKey: ['permissions'] })
  }

  async function reject(id: number) {
    const reason = prompt('Motivo del rechazo (opcional):') ?? ''
    await api.patch(`/api/permissions/${id}/reject`, { rejection_reason: reason })
    qc.invalidateQueries({ queryKey: ['permissions'] })
  }

  const rows = (data || []).filter(r => filter === 'all' || r.status === filter)

  const pending  = (data || []).filter(r => r.status === 'pending').length
  const approved = (data || []).filter(r => r.status === 'approved').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="text-blue-600" size={26} />
          <h1 className="text-2xl font-bold text-slate-900">Permisos y Ausencias</h1>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} /> Nuevo permiso
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Pendientes</p>
          <p className="text-3xl font-bold text-amber-700">{pending}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Aprobados</p>
          <p className="text-3xl font-bold text-green-700">{approved}</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total</p>
          <p className="text-3xl font-bold text-slate-700">{(data || []).length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f === 'all' ? 'Todos' : STATUS_CFG[f]?.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">Cargando permisos...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Empleado</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Período</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Motivo</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(row => {
                const cfg = STATUS_CFG[row.status]
                const days = Math.max(1,
                  Math.round((new Date(row.date_to).getTime() - new Date(row.date_from).getTime()) / 86400000) + 1
                )
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.employee_name}</td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[row.type] || row.type}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      <div>
                        {format(new Date(row.date_from + 'T12:00'), "dd/MM/yyyy")}
                        {row.date_from !== row.date_to && (
                          <> – {format(new Date(row.date_to + 'T12:00'), "dd/MM/yyyy")}</>
                        )}
                      </div>
                      <div className="text-slate-400">{days} día{days > 1 ? 's' : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{row.reason || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === 'pending' && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => approve(row.id)}
                            className="text-green-600 hover:text-green-800 text-xs font-medium px-2 py-1 rounded-lg hover:bg-green-50"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => reject(row.id)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded-lg hover:bg-red-50"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Sin permisos registrados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
