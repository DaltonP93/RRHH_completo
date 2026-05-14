'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

// ─── Types ─────────────────────────────────────────────────────
interface DiagnoseResult {
  connection: { ok: boolean; totalRecords?: number; totalEmployees?: number; error?: string }
  schema: { TABLE_NAME: string; col_count: number }[]
  counts: Record<string, number | null>
  date_range: { min_date?: string; max_date?: string; total?: number } | null
}

interface SyncRun {
  id: number
  sync_type: string
  entity_type: string
  status: string
  started_at: string
  finished_at?: string
  total_read: number
  total_inserted: number
  total_skipped: number
  total_errors: number
  error_message?: string
}

interface EmployeeMap {
  id: number
  source_user_id: string
  source_badge_number: string
  raw_name: string
  match_status: string
  employee_id?: number
  first_name?: string
  last_name?: string
  employee_code?: string
}

interface ReconcileResult {
  id: number
  employee_id: number
  date: string
  issue_type: string
  source_count: number
  local_count: number
  status: string
  first_name?: string
  last_name?: string
  employee_code?: string
}

interface UnknownEvent {
  id: number
  source_user_id: string
  check_time: string
  check_type: string
  normalized_type: string
  sensor_id?: number
  status: string
  notes?: string
  created_at: string
}

// ─── Status badge helper ────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed:     'bg-green-100 text-green-800',
    running:       'bg-blue-100 text-blue-800',
    failed:        'bg-red-100 text-red-800',
    pending:       'bg-yellow-100 text-yellow-800',
    cancelled:     'bg-gray-100 text-gray-600',
    matched:       'bg-green-100 text-green-800',
    unmatched:     'bg-red-100 text-red-800',
    manual:        'bg-purple-100 text-purple-800',
    manual_review: 'bg-yellow-100 text-yellow-800',
    open:          'bg-red-100 text-red-800',
    resolved:      'bg-green-100 text-green-800',
    ignored:       'bg-gray-100 text-gray-600',
    assigned:      'bg-green-100 text-green-800',
    legacy_att2000:'bg-yellow-100 text-yellow-800',
    hybrid:        'bg-blue-100 text-blue-800',
    direct_only:   'bg-green-100 text-green-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  )
}

// ─── Main Page ──────────────────────────────────────────────────
type Tab = 'conexion' | 'diagnostico' | 'empleados' | 'importacion' | 'reconciliacion' | 'desconocidos' | 'runs' | 'modo'

export default function SyncAtt2000Page() {
  const [tab, setTab] = useState<Tab>('conexion')

  // Conexión dinámica
  const [conn, setConn] = useState({ host: '', port: '1433', database: 'att2000', user: 'sa', password: '' })
  const [testResult, setTestResult] = useState<any>(null)
  const [testLoading, setTestLoading] = useState(false)

  // Diagnóstico
  const [diagnose, setDiagnose] = useState<DiagnoseResult | null>(null)
  const [diagnoseLoading, setDiagnoseLoading] = useState(false)

  // Source mode
  const [sourceMode, setSourceMode] = useState<string>('legacy_att2000')

  // Sync runs
  const [runs, setRuns] = useState<SyncRun[]>([])

  // Employee map
  const [empMap, setEmpMap] = useState<EmployeeMap[]>([])
  const [empMapFilter, setEmpMapFilter] = useState('unmatched')
  const [mapAssign, setMapAssign] = useState<{ mapId: number | null; employeeId: string; notes: string }>({ mapId: null, employeeId: '', notes: '' })
  const [mapAssignLoading, setMapAssignLoading] = useState(false)

  // Importación
  const [importForm, setImportForm] = useState({ from: '', to: '', limit: '10000' })
  const [importResult, setImportResult] = useState<any>(null)
  const [importLoading, setImportLoading] = useState(false)

  // Importar departamentos
  const [deptResult, setDeptResult] = useState<any>(null)
  const [deptLoading, setDeptLoading] = useState(false)

  // Reconciliación
  const [reconcileForm, setReconcileForm] = useState({ from: '', to: '' })
  const [reconcileResult, setReconcileResult] = useState<any>(null)
  const [reconcileResults, setReconcileResults] = useState<ReconcileResult[]>([])
  const [reconcileLoading, setReconcileLoading] = useState(false)

  // Eventos desconocidos
  const [unknownEvents, setUnknownEvents] = useState<UnknownEvent[]>([])
  const [unknownFilter, setUnknownFilter] = useState('pending')
  const [assignForm, setAssignForm] = useState<{ eventId: number | null; employeeId: string; notes: string }>({ eventId: null, employeeId: '', notes: '' })
  const [assignLoading, setAssignLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }
    else { setError(msg); setTimeout(() => setError(null), 5000) }
  }

  useEffect(() => {
    if (tab === 'runs')           loadRuns()
    if (tab === 'empleados')      loadEmpMap()
    if (tab === 'reconciliacion') loadReconcileResults()
    if (tab === 'modo')           loadSourceMode()
    if (tab === 'desconocidos')   loadUnknownEvents()
  }, [tab, empMapFilter, unknownFilter])

  async function loadSourceMode() {
    try {
      const { data } = await api.get('/api/sync/att2000/source-mode')
      setSourceMode(data.mode)
    } catch {}
  }

  async function loadRuns() {
    try {
      const { data } = await api.get('/api/sync/att2000/runs?limit=30')
      setRuns(data)
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
  }

  async function loadEmpMap() {
    try {
      const { data } = await api.get(`/api/sync/att2000/employee-map?status=${empMapFilter}&limit=200`)
      setEmpMap(data)
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
  }

  async function loadReconcileResults() {
    try {
      const { data } = await api.get('/api/sync/att2000/reconcile-results?status=open&limit=100')
      setReconcileResults(data)
    } catch {}
  }

  async function loadUnknownEvents() {
    try {
      const { data } = await api.get(`/api/sync/att2000/unknown-events?status=${unknownFilter}&limit=100`)
      setUnknownEvents(data)
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
  }

  async function handleTest() {
    setTestLoading(true); setTestResult(null)
    try {
      const { data } = await api.post('/api/sync/att2000/test-connection', conn)
      setTestResult(data)
      if (data.ok) flash('Conexion exitosa')
    } catch (e: any) {
      setTestResult({ ok: false, error: e.response?.data?.error || e.message })
    } finally { setTestLoading(false) }
  }

  async function handleDiagnose() {
    setDiagnoseLoading(true)
    try {
      const { data } = await api.get('/api/sync/att2000/diagnose')
      setDiagnose(data)
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, 'error')
    } finally { setDiagnoseLoading(false) }
  }

  async function handleImportDepartments() {
    setDeptLoading(true); setDeptResult(null)
    try {
      const { data } = await api.post('/api/sync/att2000/import-departments')
      setDeptResult(data)
      flash(`Departamentos: ${data.inserted} importados`)
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
    finally { setDeptLoading(false) }
  }

  async function handleImportUsers() {
    try {
      const { data } = await api.post('/api/sync/att2000/import-users')
      flash(`Usuarios: ${data.inserted} importados al mapeo`)
      loadEmpMap()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
  }

  async function handleMapAssign() {
    if (!mapAssign.mapId || !mapAssign.employeeId) { flash('Completar ID de empleado', 'error'); return }
    setMapAssignLoading(true)
    try {
      const { data } = await api.post(`/api/sync/att2000/employee-map/${mapAssign.mapId}/assign`, {
        employee_id: parseInt(mapAssign.employeeId),
        notes: mapAssign.notes,
      })
      flash(`Mapeado a: ${data.employee.name} (${data.employee.code})`)
      setMapAssign({ mapId: null, employeeId: '', notes: '' })
      loadEmpMap()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
    finally { setMapAssignLoading(false) }
  }

  async function handleImportPunches() {
    if (!importForm.from || !importForm.to) { flash('Completar fechas', 'error'); return }
    setImportLoading(true); setImportResult(null)
    try {
      const { data } = await api.post('/api/sync/att2000/import-punches', {
        from: importForm.from,
        to:   importForm.to,
        limit: parseInt(importForm.limit),
      })
      setImportResult(data)
      flash(`Importacion completada: ${data.imported} registros`)
      loadRuns()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
    finally { setImportLoading(false) }
  }

  async function handleReconcile() {
    if (!reconcileForm.from || !reconcileForm.to) { flash('Completar fechas', 'error'); return }
    setReconcileLoading(true); setReconcileResult(null)
    try {
      const { data } = await api.post('/api/sync/att2000/reconcile', reconcileForm)
      setReconcileResult(data)
      flash(`Reconciliacion: ${data.issues_found} diferencias encontradas`)
      loadReconcileResults()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
    finally { setReconcileLoading(false) }
  }

  async function handleAssign() {
    if (!assignForm.eventId || !assignForm.employeeId) { flash('Completar ID de empleado', 'error'); return }
    setAssignLoading(true)
    try {
      await api.post(`/api/sync/att2000/unknown-events/${assignForm.eventId}/assign`, {
        employee_id: parseInt(assignForm.employeeId),
        notes: assignForm.notes,
      })
      flash('Evento asignado correctamente')
      setAssignForm({ eventId: null, employeeId: '', notes: '' })
      loadUnknownEvents()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
    finally { setAssignLoading(false) }
  }

  async function changeSourceMode(mode: string) {
    try {
      await api.post('/api/sync/att2000/source-mode', { mode })
      setSourceMode(mode)
      flash(`Modo cambiado a: ${mode}`)
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'conexion',       label: 'Conexion' },
    { id: 'diagnostico',    label: 'Diagnostico' },
    { id: 'empleados',      label: 'Mapeo Empleados' },
    { id: 'importacion',    label: 'Importacion' },
    { id: 'reconciliacion', label: 'Reconciliacion' },
    { id: 'desconocidos',   label: 'Desconocidos' },
    { id: 'runs',           label: 'Historial Runs' },
    { id: 'modo',           label: 'Modo Fuente' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Migracion att2000</h1>
        <p className="text-gray-500 text-sm mt-1">
          Herramienta de transicion desde SQL Server att2000 hacia MySQL local.
          Modo actual: <StatusBadge status={sourceMode} />
        </p>
      </div>

      {/* Alerts */}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">{success}</div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded text-sm">{error}</div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >{t.label}</button>
          ))}
        </nav>
      </div>

      {/* ── Tab: Conexion ─────────────────────────────────────── */}
      {tab === 'conexion' && (
        <div className="max-w-xl">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-semibold text-lg mb-4">Probar conexion SQL Server</h2>
            <p className="text-sm text-gray-500 mb-4">
              Sobreescribe temporalmente los parametros de conexion al att2000 (ATT_HOST, ATT_USER, etc.) para probar sin reiniciar el servidor.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Host / IP</label>
                <input className="w-full border rounded px-3 py-2 text-sm"
                  value={conn.host} onChange={e => setConn(c => ({ ...c, host: e.target.value }))}
                  placeholder="192.168.1.x" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
                <input className="w-full border rounded px-3 py-2 text-sm"
                  value={conn.port} onChange={e => setConn(c => ({ ...c, port: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base de datos</label>
                <input className="w-full border rounded px-3 py-2 text-sm"
                  value={conn.database} onChange={e => setConn(c => ({ ...c, database: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                <input className="w-full border rounded px-3 py-2 text-sm"
                  value={conn.user} onChange={e => setConn(c => ({ ...c, user: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contrasena</label>
                <input type="password" className="w-full border rounded px-3 py-2 text-sm"
                  value={conn.password} onChange={e => setConn(c => ({ ...c, password: e.target.value }))} />
              </div>
            </div>
            <button onClick={handleTest} disabled={testLoading}
              className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              {testLoading ? 'Probando...' : 'Probar conexion'}
            </button>

            {testResult && (
              <div className={`mt-4 p-4 rounded border ${testResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                {testResult.ok ? (
                  <div>
                    <p className="font-medium text-green-800 mb-2">Conexion exitosa</p>
                    <p className="text-sm text-green-700">Marcaciones totales: {testResult.totalRecords?.toLocaleString()}</p>
                  </div>
                ) : (
                  <p className="text-red-700 text-sm">{testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Diagnostico ──────────────────────────────────── */}
      {tab === 'diagnostico' && (
        <div className="max-w-3xl">
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Diagnostico att2000</h2>
              <button onClick={handleDiagnose} disabled={diagnoseLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {diagnoseLoading ? 'Analizando...' : 'Ejecutar diagnostico'}
              </button>
            </div>

            {!diagnose && !diagnoseLoading && (
              <p className="text-gray-500 text-sm">Presiona el boton para analizar la base de datos att2000.</p>
            )}

            {diagnose && (
              <div className="space-y-5">
                {/* Conexion */}
                <div className={`flex items-center gap-2 p-3 rounded ${diagnose.connection.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${diagnose.connection.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className={`font-medium text-sm ${diagnose.connection.ok ? 'text-green-800' : 'text-red-800'}`}>
                    {diagnose.connection.ok
                      ? `Conectado — ${diagnose.connection.totalRecords?.toLocaleString()} marcaciones`
                      : `Sin conexion: ${diagnose.connection.error}`}
                  </span>
                </div>

                {/* Conteos */}
                {diagnose.connection.ok && (
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(diagnose.counts).map(([table, count]) => (
                      <div key={table} className="bg-gray-50 rounded p-3">
                        <p className="text-xs text-gray-500">{table}</p>
                        <p className="font-semibold text-gray-900">{count?.toLocaleString() ?? 'N/A'}</p>
                      </div>
                    ))}
                    {diagnose.date_range && (
                      <>
                        <div className="bg-gray-50 rounded p-3">
                          <p className="text-xs text-gray-500">Primera marcacion</p>
                          <p className="font-semibold text-gray-900 text-sm">
                            {diagnose.date_range.min_date ? new Date(diagnose.date_range.min_date).toLocaleDateString('es-PY') : 'N/A'}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded p-3">
                          <p className="text-xs text-gray-500">Ultima marcacion</p>
                          <p className="font-semibold text-gray-900 text-sm">
                            {diagnose.date_range.max_date ? new Date(diagnose.date_range.max_date).toLocaleDateString('es-PY') : 'N/A'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Schema */}
                {diagnose.schema.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Tablas detectadas</p>
                    <div className="flex flex-wrap gap-2">
                      {diagnose.schema.map(t => (
                        <span key={t.TABLE_NAME} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded font-mono">
                          {t.TABLE_NAME} ({t.col_count} cols)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Mapeo Empleados ──────────────────────────────── */}
      {tab === 'empleados' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-lg">Mapeo de empleados</h2>
              <select value={empMapFilter} onChange={e => setEmpMapFilter(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm">
                <option value="unmatched">Sin mapear</option>
                <option value="matched">Mapeados</option>
                <option value="manual">Manual</option>
                <option value="manual_review">Revision manual</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={loadEmpMap} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">
                Actualizar
              </button>
              <button onClick={handleImportUsers}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
                Importar usuarios att2000
              </button>
              <button onClick={handleImportDepartments} disabled={deptLoading}
                className="border border-blue-300 text-blue-700 px-4 py-1.5 rounded text-sm hover:bg-blue-50 disabled:opacity-50">
                {deptLoading ? 'Importando...' : 'Importar departamentos'}
              </button>
            </div>
          </div>

          {deptResult && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              Departamentos: {deptResult.inserted} insertados, {deptResult.errors} errores
            </div>
          )}

          {/* Formulario asignacion manual */}
          {mapAssign.mapId && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-800 mb-3">
                Asignar entrada #{mapAssign.mapId} a empleado local
              </p>
              <div className="flex gap-3 flex-wrap">
                <input
                  type="number"
                  placeholder="ID empleado local"
                  value={mapAssign.employeeId}
                  onChange={e => setMapAssign(f => ({ ...f, employeeId: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-48"
                />
                <input
                  type="text"
                  placeholder="Notas (opcional)"
                  value={mapAssign.notes}
                  onChange={e => setMapAssign(f => ({ ...f, notes: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm flex-1 min-w-48"
                />
                <button onClick={handleMapAssign} disabled={mapAssignLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                  {mapAssignLoading ? 'Guardando...' : 'Confirmar mapeo'}
                </button>
                <button onClick={() => setMapAssign({ mapId: null, employeeId: '', notes: '' })}
                  className="border px-4 py-2 rounded text-sm hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Origen</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Badge</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre att2000</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado local</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {empMap.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>
                )}
                {empMap.map(m => (
                  <tr key={m.id} className={`hover:bg-gray-50 ${mapAssign.mapId === m.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-2 font-mono text-xs">{m.source_user_id}</td>
                    <td className="px-4 py-2 font-mono text-xs">{m.source_badge_number}</td>
                    <td className="px-4 py-2">{m.raw_name}</td>
                    <td className="px-4 py-2">
                      {m.first_name
                        ? <span>{m.first_name} {m.last_name} <span className="text-gray-400 text-xs">({m.employee_code})</span></span>
                        : <span className="text-gray-400 text-xs">Sin mapear</span>
                      }
                    </td>
                    <td className="px-4 py-2"><StatusBadge status={m.match_status} /></td>
                    <td className="px-4 py-2">
                      {(m.match_status === 'unmatched' || m.match_status === 'manual_review') && (
                        <button
                          onClick={() => setMapAssign({ mapId: m.id, employeeId: '', notes: '' })}
                          className="text-xs text-blue-600 hover:text-blue-800 underline">
                          Asignar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Importacion ─────────────────────────────────── */}
      {tab === 'importacion' && (
        <div className="max-w-xl">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-semibold text-lg mb-2">Importar marcaciones historicas</h2>
            <p className="text-sm text-gray-500 mb-4">
              Lee CHECKINOUT de att2000 en el rango indicado y las inserta en attendance_logs.
              Asegurate de importar usuarios primero para que el mapeo este completo.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                <input type="date" className="w-full border rounded px-3 py-2 text-sm"
                  value={importForm.from} onChange={e => setImportForm(f => ({ ...f, from: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                <input type="date" className="w-full border rounded px-3 py-2 text-sm"
                  value={importForm.to} onChange={e => setImportForm(f => ({ ...f, to: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Limite de registros</label>
                <input type="number" className="w-full border rounded px-3 py-2 text-sm"
                  value={importForm.limit} onChange={e => setImportForm(f => ({ ...f, limit: e.target.value }))} />
              </div>
            </div>
            <button onClick={handleImportPunches} disabled={importLoading}
              className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {importLoading ? 'Importando... esto puede tardar varios minutos' : 'Iniciar importacion'}
            </button>

            {importResult && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="font-medium text-blue-800 mb-3">Resultado</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                  <div>Total leidos: <strong>{importResult.read?.toLocaleString()}</strong></div>
                  <div>En staging: <strong>{importResult.staged?.toLocaleString()}</strong></div>
                  <div>Importados: <strong>{importResult.imported?.toLocaleString()}</strong></div>
                  <div>Duplicados: <strong>{importResult.dupes?.toLocaleString()}</strong></div>
                  <div>Desconocidos: <strong>{importResult.unknown?.toLocaleString()}</strong></div>
                  <div>Errores: <strong>{importResult.errors}</strong></div>
                </div>
                <p className="text-xs text-blue-600 mt-2">Run ID: #{importResult.run_id}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Reconciliacion ───────────────────────────────── */}
      {tab === 'reconciliacion' && (
        <div>
          <div className="bg-white border rounded-lg p-6 max-w-xl mb-6">
            <h2 className="font-semibold text-lg mb-2">Reconciliar marcaciones</h2>
            <p className="text-sm text-gray-500 mb-4">
              Compara que empleados mapeados tienen marcaciones en el periodo indicado. Detecta ausencias locales.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                <input type="date" className="w-full border rounded px-3 py-2 text-sm"
                  value={reconcileForm.from} onChange={e => setReconcileForm(f => ({ ...f, from: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                <input type="date" className="w-full border rounded px-3 py-2 text-sm"
                  value={reconcileForm.to} onChange={e => setReconcileForm(f => ({ ...f, to: e.target.value }))} />
              </div>
            </div>
            <button onClick={handleReconcile} disabled={reconcileLoading}
              className="w-full bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50 text-sm font-medium">
              {reconcileLoading ? 'Reconciliando...' : 'Ejecutar reconciliacion'}
            </button>
            {reconcileResult && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-800">
                <strong>{reconcileResult.issues_found}</strong> diferencias — {reconcileResult.employees_checked} empleados chequeados (Run #{reconcileResult.run_id})
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-700">Diferencias abiertas</h3>
            <button onClick={loadReconcileResults} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">Actualizar</button>
          </div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Origen</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Local</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reconcileResults.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin diferencias abiertas</td></tr>
                )}
                {reconcileResults.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {r.first_name} {r.last_name}
                      <span className="text-gray-400 text-xs ml-1">({r.employee_code})</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{r.date}</td>
                    <td className="px-4 py-2 text-xs font-mono">{r.issue_type}</td>
                    <td className="px-4 py-2 text-center">{r.source_count}</td>
                    <td className="px-4 py-2 text-center">{r.local_count}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Eventos Desconocidos ─────────────────────────── */}
      {tab === 'desconocidos' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-lg">Eventos desconocidos</h2>
              <select value={unknownFilter} onChange={e => setUnknownFilter(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm">
                <option value="pending">Pendientes</option>
                <option value="assigned">Asignados</option>
                <option value="ignored">Ignorados</option>
              </select>
            </div>
            <button onClick={loadUnknownEvents} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">Actualizar</button>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Marcaciones de att2000 cuyo USERID no tiene mapeo a un empleado local.
            Asignalas manualmente o importa los usuarios primero.
          </p>

          {/* Formulario asignacion */}
          {assignForm.eventId && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-800 mb-3">
                Asignar evento #{assignForm.eventId} a empleado local
              </p>
              <div className="flex gap-3 flex-wrap">
                <input
                  type="number"
                  placeholder="ID empleado local"
                  value={assignForm.employeeId}
                  onChange={e => setAssignForm(f => ({ ...f, employeeId: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-48"
                />
                <input
                  type="text"
                  placeholder="Notas (opcional)"
                  value={assignForm.notes}
                  onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm flex-1 min-w-48"
                />
                <button onClick={handleAssign} disabled={assignLoading}
                  className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50">
                  {assignLoading ? 'Asignando...' : 'Confirmar'}
                </button>
                <button onClick={() => setAssignForm({ eventId: null, employeeId: '', notes: '' })}
                  className="border px-4 py-2 rounded text-sm hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario att2000</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha/Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sensor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unknownEvents.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {unknownFilter === 'pending' ? 'Sin eventos desconocidos pendientes' : 'Sin resultados'}
                  </td></tr>
                )}
                {unknownEvents.map(ev => (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 text-xs">#{ev.id}</td>
                    <td className="px-4 py-2 font-mono text-xs">{ev.source_user_id}</td>
                    <td className="px-4 py-2 text-xs">
                      {ev.check_time ? new Date(ev.check_time).toLocaleString('es-PY') : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium ${ev.normalized_type === 'in' ? 'text-green-700' : ev.normalized_type === 'out' ? 'text-red-700' : 'text-gray-500'}`}>
                        {ev.normalized_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{ev.sensor_id ?? '—'}</td>
                    <td className="px-4 py-2"><StatusBadge status={ev.status} /></td>
                    <td className="px-4 py-2">
                      {ev.status === 'pending' && (
                        <button
                          onClick={() => setAssignForm({ eventId: ev.id, employeeId: '', notes: '' })}
                          className="text-xs text-blue-600 hover:text-blue-800 underline">
                          Asignar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Historial Runs ───────────────────────────────── */}
      {tab === 'runs' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Historial de sincronizaciones</h2>
            <button onClick={loadRuns} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">Actualizar</button>
          </div>
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entidad</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inicio</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Leidos</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Insertados</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Omitidos</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Errores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Sin runs registrados</td></tr>
                )}
                {runs.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 text-xs">#{r.id}</td>
                    <td className="px-4 py-2 text-xs">{r.sync_type}</td>
                    <td className="px-4 py-2 text-xs">{r.entity_type}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      {r.started_at ? new Date(r.started_at).toLocaleString('es-PY') : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">{r.total_read?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-xs text-green-700">{r.total_inserted?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-xs text-yellow-700">{r.total_skipped?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-xs text-red-700">{r.total_errors?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Modo Fuente ──────────────────────────────────── */}
      {tab === 'modo' && (
        <div className="max-w-2xl">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-semibold text-lg mb-2">Modo de fuente de asistencia</h2>
            <p className="text-sm text-gray-500 mb-6">
              Controla de donde provienen las marcaciones del sistema. Cambiar con cuidado — afecta a todos los empleados.
            </p>
            <div className="grid gap-4">
              {[
                {
                  mode: 'legacy_att2000',
                  title: 'Fase A — Solo att2000 (Inicial)',
                  description: 'Las marcaciones provienen exclusivamente de SQL Server att2000 via sincronizacion periodica. Usar durante la transicion inicial.',
                  color: 'border-yellow-400 bg-yellow-50',
                },
                {
                  mode: 'hybrid',
                  title: 'Fase B — Modo hibrido',
                  description: 'att2000 sincroniza en paralelo mientras el Bridge ZKTeco ya capta marcaciones directamente. Permite comparar y validar la migracion.',
                  color: 'border-blue-400 bg-blue-50',
                },
                {
                  mode: 'direct_only',
                  title: 'Fase C — Solo directo (Final)',
                  description: 'El sistema ya no consulta att2000. Las marcaciones entran exclusivamente por el Bridge ZKTeco o la app. Estado final post-migracion.',
                  color: 'border-green-400 bg-green-50',
                },
              ].map(opt => (
                <button key={opt.mode} onClick={() => changeSourceMode(opt.mode)}
                  className={`border-2 rounded-lg p-4 text-left transition-all ${
                    sourceMode === opt.mode
                      ? opt.color + ' ring-2 ring-offset-1 ring-blue-500'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-gray-900">{opt.title}</p>
                    {sourceMode === opt.mode && (
                      <span className="text-xs text-blue-700 font-semibold bg-blue-100 px-2 py-0.5 rounded">ACTIVO</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{opt.description}</p>
                  <p className="text-xs text-gray-400 mt-1 font-mono">{opt.mode}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
