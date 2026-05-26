'use client'
import { useState, useEffect } from 'react'
import { Send, Loader2, Info, Eye, Upload, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

interface MtessRecord {
  id: number
  communication_type?: string
  tipo?: string
  period_year?: number
  period_month?: number
  periodo?: string
  status?: string
  estado?: string
  generated_at?: string
  fecha_generacion?: string
  submission_date?: string
  fecha_envio?: string
  acuse?: string
  employee_name?: string
}

const PRESENTATION_TYPE_LABELS: Record<string, string> = {
  ALTA: 'Alta Personal',
  BAJA: 'Baja Personal',
  VACACIONES: 'Vacaciones',
  PERMISO: 'Permiso',
  SUSPENSION: 'Suspensión',
  ACCIDENTE: 'Accidente Laboral',
  LIQUIDACION: 'Liquidación',
  AGUINALDO: 'Aguinaldo',
  PLANILLA_ANUAL: 'Planilla Anual',
  AMONESTACION: 'Amonestación',
}

const TYPES_LEGEND = [
  { code: 'ALTA', label: 'Alta Personal', desc: 'Ingreso de nuevo empleado' },
  { code: 'BAJA', label: 'Baja Personal', desc: 'Egreso / desvinculación' },
  { code: 'VACACIONES', label: 'Vacaciones', desc: 'Período vacacional' },
  { code: 'PERMISO', label: 'Permiso', desc: 'Licencia con o sin goce' },
  { code: 'SUSPENSION', label: 'Suspensión', desc: 'Suspensión disciplinaria' },
  { code: 'ACCIDENTE', label: 'Accidente Laboral', desc: 'Accidente en el trabajo' },
  { code: 'LIQUIDACION', label: 'Liquidación', desc: 'Liquidación final' },
  { code: 'AGUINALDO', label: 'Aguinaldo', desc: 'Pago de aguinaldo anual' },
  { code: 'PLANILLA_ANUAL', label: 'Planilla Anual', desc: 'Planilla anual obligatoria' },
  { code: 'AMONESTACION', label: 'Amonestación', desc: 'Sanción disciplinaria' },
]

function getStatus(item: MtessRecord): string { return item.status ?? item.estado ?? 'pending' }
function getTipo(item: MtessRecord): string { return item.communication_type ?? item.tipo ?? '—' }
function getPeriodo(item: MtessRecord): string {
  if (item.periodo) return item.periodo
  if (item.period_year) return `${item.period_month ?? ''}/${item.period_year}`
  return '—'
}
function getFechaGen(item: MtessRecord): string {
  const d = item.generated_at ?? item.fecha_generacion
  return d ? new Date(d).toLocaleDateString('es-PY') : '—'
}
function getFechaEnvio(item: MtessRecord): string {
  const d = item.submission_date ?? item.fecha_envio
  return d ? new Date(d).toLocaleDateString('es-PY') : '—'
}

export default function MtessPage() {
  const [items, setItems] = useState<MtessRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    communication_type: 'ALTA',
    period_year: new Date().getFullYear(),
    period_month: new Date().getMonth() + 1,
    employee_id: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [filterYear])

  function load() {
    setLoading(true)
    api.get('/api/compliance/mtess', { params: { year: filterYear } })
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.communications) ? d.communications : [])))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  async function updateStatus(id: number, newStatus: string) {
    try { await api.put(`/api/compliance/mtess/${id}`, { status: newStatus }); load() } catch {}
  }

  async function savePresentation() {
    setSaving(true)
    try {
      await api.post('/api/compliance/mtess', form)
      setShowModal(false)
      load()
    } catch {
      alert('Error al registrar la presentación')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <EnterprisePageHeader
        icon={Send}
        iconColor="bg-blue-600"
        title="MTESS / REOP"
        subtitle="Presentaciones electrónicas al Ministerio de Trabajo, Empleo y Seguridad Social"
        breadcrumbs={[
          { label: 'Cumplimiento Legal', href: '/cumplimiento' },
          { label: 'MTESS / REOP' },
        ]}
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Send size={14} />
            Generar presentación
          </button>
        }
      />

      {/* Status flow info */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <span>
          <strong>Flujo de presentación MTESS:</strong>{' '}
          pendiente → generado → enviado → aceptado / rechazado
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600 font-medium">Año:</label>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-slate-300" size={24} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Send}
            title="Sin presentaciones registradas"
            description={`No hay presentaciones MTESS para el año ${filterYear}.`}
            action={{ label: 'Generar presentación', onClick: () => setShowModal(true) }}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha generación</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha envío</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Acuse</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => {
                const st = getStatus(item)
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                        {PRESENTATION_TYPE_LABELS[getTipo(item)] ?? getTipo(item)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{getPeriodo(item)}</td>
                    <td className="px-4 py-3"><StatusBadge status={st} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{getFechaGen(item)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{getFechaEnvio(item)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.acuse ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50">
                          <Eye size={11} /> Ver
                        </button>
                        {(st === 'pending' || st === 'generated') && (
                          <button
                            onClick={() => updateStatus(item.id, 'submitted')}
                            className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 rounded px-2 py-1 hover:bg-teal-50"
                          >
                            <Upload size={11} /> Registrar envío
                          </button>
                        )}
                        {st === 'submitted' && (
                          <button
                            onClick={() => updateStatus(item.id, 'accepted')}
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded px-2 py-1 hover:bg-emerald-50"
                          >
                            <CheckCircle size={11} /> Registrar acuse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Types Legend */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Tipos de presentación MTESS</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TYPES_LEGEND.map(t => (
            <div key={t.code} className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-blue-700">{t.code}</p>
              <p className="text-xs text-slate-700 font-medium mt-0.5">{t.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modal - Generar presentación */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-base font-bold text-slate-900 mb-4">Nueva presentación MTESS / REOP</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de presentación</label>
                <select
                  value={form.communication_type}
                  onChange={e => setForm(p => ({ ...p, communication_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(PRESENTATION_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Año</label>
                  <input
                    type="number"
                    value={form.period_year}
                    onChange={e => setForm(p => ({ ...p, period_year: +e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mes (1–12)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={form.period_month}
                    onChange={e => setForm(p => ({ ...p, period_month: +e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ID Empleado (opcional)</label>
                <input
                  value={form.employee_id}
                  onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
                  placeholder="Dejar vacío para presentación general"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={savePresentation}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                Registrar envío
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
