'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  CheckSquare, Check, X, Clock, UserCircle2, Calendar,
  AlertCircle, ChevronRight, CheckCircle, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useCurrentUser } from '@/lib/useCurrentUser'
import ApprovalsSlaWidget from '@/components/ApprovalsSlaWidget'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'

interface ApprovalItem {
  id: number
  employee_id?: number
  employee_name?: string
  employee_code?: string
  department?: string | null
  type?: string
  description?: string | null
  reason?: string | null
  date_from?: string
  date_to?: string
  created_at?: string
  status?: string
  approval_state?: string
  // SLA endpoint fields
  request_type?: string
  requester_name?: string
  days_pending?: number
}

const TYPE_LABEL: Record<string, string> = {
  vacation: 'Vacaciones', sick: 'Enfermedad', personal: 'Personal',
  maternity: 'Maternidad', paternity: 'Paternidad', study: 'Estudio',
  legal: 'Legal', other: 'Otro', overtime: 'Hora extra', correction: 'Corrección',
}

type TabKey = 'pending' | 'approved' | 'rejected'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'pending',  label: 'Pendientes',  icon: Clock },
  { key: 'approved', label: 'Aprobadas',   icon: CheckCircle },
  { key: 'rejected', label: 'Rechazadas',  icon: XCircle },
]

function daysDiff(dateStr?: string): number {
  if (!dateStr) return 0
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function getItemStatus(item: ApprovalItem): string {
  return item.status || item.approval_state || 'pending'
}

function getItemName(item: ApprovalItem): string {
  return item.employee_name || item.requester_name || '—'
}

function getItemCode(item: ApprovalItem): string {
  return item.employee_code || ''
}

function getItemType(item: ApprovalItem): string {
  const t = item.type || item.request_type || ''
  return TYPE_LABEL[t] || t || '—'
}

function getItemDescription(item: ApprovalItem): string {
  return item.description || item.reason || '—'
}

export default function AprobacionesPage() {
  const user = useCurrentUser()
  const [allItems, setAllItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/api/approvals-sla?status=pending').then(r => r.data || []).catch(() => []),
      api.get('/api/approvals-sla?status=approved').then(r => r.data || []).catch(() => []),
      api.get('/api/approvals-sla?status=rejected').then(r => r.data || []).catch(() => []),
      api.get('/api/permissions/inbox').then(r => r.data || []).catch(() => []),
    ]).then(([slaP, slaA, slaR, inbox]) => {
      // Merge, dedup by id
      const seen = new Set<number>()
      const merged: ApprovalItem[] = []
      for (const item of [...slaP, ...slaA, ...slaR, ...inbox]) {
        if (!seen.has(item.id)) { seen.add(item.id); merged.push(item) }
      }
      setAllItems(merged)
    }).finally(() => setLoading(false))
  }, [])

  const roleLabel = user?.role === 'coordinator' ? 'Coordinador (Nivel 1)'
    : user?.role === 'manager' ? 'Gerente (Nivel 2)'
    : user?.role === 'super_admin' ? 'Super Admin (todos los niveles)'
    : 'GTH (aprobación final)'

  const filtered = allItems.filter(item => {
    const s = getItemStatus(item)
    if (activeTab === 'pending') return s === 'pending' || s === 'level1_ok' || s === 'level2_ok'
    if (activeTab === 'approved') return s === 'approved' || s === 'accepted'
    if (activeTab === 'rejected') return s === 'rejected' || s === 'cancelled'
    return true
  })

  const pendingCount = allItems.filter(item => {
    const s = getItemStatus(item)
    return s === 'pending' || s === 'level1_ok' || s === 'level2_ok'
  }).length

  function handleApprove() {
    showToast('Funcionalidad disponible en la próxima versión')
  }
  function handleReject() {
    showToast('Funcionalidad disponible en la próxima versión')
  }

  const emptyMessages: Record<TabKey, { title: string; description: string }> = {
    pending:  { title: 'Sin solicitudes pendientes', description: '¡Estás al día! No hay solicitudes que requieran tu aprobación.' },
    approved: { title: 'Sin aprobaciones', description: 'No se encontraron solicitudes aprobadas.' },
    rejected: { title: 'Sin rechazos', description: 'No se encontraron solicitudes rechazadas.' },
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl relative">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
          <AlertCircle size={14} className="text-amber-400" />
          {toastMsg}
        </div>
      )}

      <EnterprisePageHeader
        icon={CheckSquare}
        iconColor="bg-emerald-600"
        title="Cola de Aprobaciones"
        subtitle="Solicitudes pendientes de autorización"
        breadcrumbs={[
          { label: 'Asistencia', href: '/asistencia' },
          { label: 'Aprobaciones' },
        ]}
        meta={
          <span className="text-xs text-slate-500">{roleLabel}</span>
        }
      />

      <ApprovalsSlaWidget />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon size={14} />
              {tab.label}
              {tab.key === 'pending' && pendingCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={activeTab === 'pending' ? CheckSquare : activeTab === 'approved' ? CheckCircle : XCircle}
            title={emptyMessages[activeTab].title}
            description={emptyMessages[activeTab].description}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Solicitante</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha solicitud</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Días pendiente</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((item, idx) => {
                  const days = item.days_pending ?? daysDiff(item.created_at)
                  const overdue = days > 3
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserCircle2 size={16} className="text-slate-300 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">{getItemName(item)}</p>
                            {getItemCode(item) && (
                              <p className="text-xs text-slate-400 font-mono">{getItemCode(item)}</p>
                            )}
                            {item.department && (
                              <p className="text-xs text-slate-400">{item.department}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 text-xs rounded-md bg-slate-100 text-slate-700 font-medium">
                          {getItemType(item)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px]">
                        <p className="line-clamp-2 text-xs">{getItemDescription(item)}</p>
                        {(item.date_from || item.date_to) && (
                          <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                            <Calendar size={10} />
                            {item.date_from}
                            {item.date_to && item.date_to !== item.date_from && ` → ${item.date_to}`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                          {days}d{overdue && <span className="ml-1 text-[10px]">⚠</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {activeTab === 'pending' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={handleApprove}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition-colors"
                            >
                              <Check size={12} /> Aprobar
                            </button>
                            <button
                              onClick={handleReject}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium transition-colors"
                            >
                              <X size={12} /> Rechazar
                            </button>
                          </div>
                        )}
                        {activeTab !== 'pending' && (
                          <div className="flex justify-end">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${
                              activeTab === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : 'bg-red-50 text-red-700 ring-red-200'
                            }`}>
                              {activeTab === 'approved' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                              {activeTab === 'approved' ? 'Aprobado' : 'Rechazado'}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
