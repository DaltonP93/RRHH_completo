'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

// ─── Types ─────────────────────────────────────────────────────
interface DiagnoseResult {
  connected: boolean
  database?: string
  host?: string
  tables_detected?: string[]
  users_count?: number
  punches_count?: number
  departments_count?: number
  min_checktime?: string
  max_checktime?: string
  issues?: string[]
  error?: string
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

// ─── Status badge helper ────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    running:   'bg-blue-100 text-blue-800',
    failed:    'bg-red-100 text-red-800',
    pending:   'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-gray-100 text-gray-600',
    matched:   'bg-green-100 text-green-800',
    unmatched: 'bg-red-100 text-red-800',
    manual_review: 'bg-yellow-100 text-yellow-800',
    open:      'bg-red-100 text-red-800',
    resolved:  'bg-green-100 text-green-800',
    ignored:   'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  )
}

// ─── Main Page ──────────────────────────────────────────────────
export default function SyncAtt2000Page() {
  const [tab, setTab] = useState<'conexion'|'diagnostico'|'empleados'|'importacion'|'reconciliacion'|'runs'|'modo'>('conexion')

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

  // Importación
  const [importForm, setImportForm] = useState({ from: '', to: '', batch_size: '5000' })
  const [importResult, setImportResult] = useState<any>(null)
  const [importLoading, setImportLoading] = useState(false)

  // Reconciliación
  const [reconcileForm, setReconcileForm] = useState({ date_from: '', date_to: '' })
  const [reconcileResult, setReconcileResult] = useState<any>(null)
  const [reconcileResults, setReconcileResults] = useState<ReconcileResult[]>([])
  const [reconcileLoading, setReconcileLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function flash(msg: string, type: 'success'|'error' = 'success') {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }
    else { setError(msg); setTimeout(() => setError(null), 5000) }
  }

  // Cargar datos según tab
  useEffect(() => {
    if (tab === 'runs') loadRuns()
    if (tab === 'empleados') loadEmpMap()
    if (tab === 'reconciliacion') loadReconcileResults()
    if (tab === 'modo') loadSourceMode()
  }, [tab, empMapFilter])

  async function loadSourceMode() {
    try {
      const { data } = await api.get('/api/sync/att2000/source-mode')
      setSourceMode(data.source_mode)
    } catch {}
  }

  async function loadRuns() {
    try {
      const { data } = await api.get('/api/sync/att2000/sync-runs?limit=30')
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

  async function handleTest() {
    setTestLoading(true); setTestResult(null)
    try {
      const { data } = await api.post('/api/sync/test-conn', conn)
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
      setDiagnose({ connected: false, error: e.response?.data?.error || e.message })
    } finally { setDiagnoseLoading(false) }
  }

  async function handleImportEmployees() {
    try {
      const { data } = await api.post('/api/sync/att2000/import-employees')
      flash(`Empleados importados: ${data.matched} mapeados, ${data.unmatched} sin mapear`)
      loadEmpMap()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
  }

  async function handleImportPunches() {
    if (!importForm.from || !importForm.to) { flash('Completar fechas', 'error'); return }
    setImportLoading(true); setImportResult(null)
    try {
      const { data } = await api.post('/api/sync/att2000/import-punches', {
        from: importForm.from, to: importForm.to,
        batch_size: parseInt(importForm.batch_size)
      })
      setImportResult(data)
      flash(`Importacion completada: ${data.imported} registros`)
      loadRuns()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
    finally { setImportLoading(false) }
  }

  async function handleReconcile() {
    if (!reconcileForm.date_from || !reconcileForm.date_to) { flash('Completar fechas', 'error'); return }
    setReconcileLoading(true); setReconcileResult(null)
    try {
      const { data } = await api.post('/api/sync/att2000/reconcile-advanced', reconcileForm)
      setReconcileResult(data)
      flash(`Reconciliacion: ${data.issues_found} diferencias encontradas`)
      loadReconcileResults()
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
    finally { setReconcileLoading(false) }
  }

  async function changeSourceMode(mode: string) {
    try {
      await api.put('/api/sync/att2000/source-mode', { mode })
      setSourceMode(mode)
      flash(`Modo cambiado a: ${mode}`)
    } catch (e: any) { flash(e.response?.data?.error || e.message, 'error') }
  }

  const tabs = [
    { id: 'conexion',        label: 'Conexion' },
    { id: 'diagnostico',     label: 'Diagnostico' },
    { id: 'empleados',       label: 'Mapeo Empleados' },
    { id: 'importacion',     label: 'Importacion' },
    { id: 'reconciliacion',  label: 'Reconciliacion' },
    { id: 'runs',            label: 'Historial Runs' },
    { id: 'modo',            label: 'Modo Fuente' },
  ] as const

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
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded">{success}</div>}
      {error   && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Host / IP</label>
                <input className="w-full border rounded px-3 py-2 text-sm"
                  value={conn.host} onChange={e => setConn(c => ({ ...c, host: e.target.value }))}
                  placeholder="192.168.1.100" />
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
              className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
              {testLoading ? 'Probando...' : 'Probar conexion'}
            </button>

            {testResult && (
              <div className={`mt-4 p-4 rounded border ${testResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                {testResult.ok ? (
                  <div>
                    <p className="font-medium text-green-800 mb-2">Conexion exitosa</p>
                    <p className="text-sm text-green-700">Marcaciones: {testResult.totalRecords?.toLocaleString()}</p>
                    <p className="text-sm text-green-700">Empleados: {testResult.totalEmployees?.toLocaleString()}</p>
                    {testResult.machines?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-green-700">Relojes detectados:</p>
                        {testResult.machines.map((m: any, i: number) => (
                          <p key={i} className="text-xs text-green-600">{m.MACHINE_ALIAS} — {m.IP_ADDRESS}</p>
                        ))}
                      </div>
                    )}
                    {testResult.recentRecords?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-green-700 mb-1">Ultimas marcaciones:</p>
                        <table className="text-xs w-full">
                          <thead><tr className="text-green-600">
                            <th className="text-left">Empleado</th><th className="text-left">Hora</th><th className="text-left">Tipo</th>
                          </tr></thead>
                          <tbody>
                            {testResult.recentRecords.map((r: any, i: number) => (
                              <tr key={i} className="text-green-700">
                                <td>{r.nombre || r.USERID}</td>
                                <td>{r.CHECKTIME ? new Date(r.CHECKTIME).toLocaleString('es-PY') : ''}</td>
                                <td>{r.CHECKTYPE}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
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
              <div>
                <div className={`flex items-center gap-2 mb-4 p-3 rounded ${diagnose.connected ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className={`w-3 h-3 rounded-full ${diagnose.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className={`font-medium text-sm ${diagnose.connected ? 'text-green-800' : 'text-red-800'}`}>
                    {diagnose.connected ? `Conectado a ${diagnose.host} / ${diagnose.database}` : `Sin conexion: ${diagnose.error}`}
                  </span>
                </div>

                {diagnose.connected && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {[
                      { label: 'Empleados (USERINFO)', value: diagnose.users_count?.toLocaleString() },
                      { label: 'Marcaciones (CHECKINOUT)', value: diagnose.punches_count?.toLocaleString() },
                      { label: 'Departamentos', value: diagnose.departments_count?.toLocaleString() },
                      { label: 'Primera marcacion', value: diagnose.min_checktime ? new Date(diagnose.min_checktime).toLocaleDateString('es-PY') : 'N/A' },
                      { label: 'Ultima marcacion', value: diagnose.max_checktime ? new Date(diagnose.max_checktime).toLocaleDateString('es-PY') : 'N/A' },
                      { label: 'Tablas detectadas', value: String(diagnose.tables_detected?.length || 0) },
                    ].map(stat => (
                      <div key={stat.label} className="bg-gray-50 rounded p-3">
                        <p className="text-xs text-gray-500">{stat.label}</p>
                        <p className="font-semibold text-gray-900">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {diagnose.tables_detected && diagnose.tables_detected.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Tablas detectadas:</p>
                    <div className="flex flex-wrap gap-2">
                      {diagnose.tables_detected.map(t => (
                        <span key={t} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {diagnose.issues && diagnose.issues.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-red-700 mb-2">Problemas detectados:</p>
                    {diagnose.issues.map((issue, i) => (
                      <p key={i} className="text-sm text-red-600">• {issue}</p>
                    ))}
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-lg">Mapeo de empleados</h2>
              <select value={empMapFilter} onChange={e => setEmpMapFilter(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm">
                <option value="unmatched">Sin mapear</option>
                <option value="matched">Mapeados</option>
                <option value="manual_review">Revision manual</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={loadEmpMap} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">
                Actualizar
              </button>
              <button onClick={handleImportEmployees}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
                Importar empleados att2000
              </button>
            </div>
          </div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Origen</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Badge</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre att2000</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado local</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {empMap.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {empMapFilter === 'unmatched' ? 'No hay empleados sin mapear' : 'Sin resultados'}
                  </td></tr>
                )}
                {empMap.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
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
            <h2 className="font-semibold text-lg mb-4">Importar marcaciones</h2>
            <p className="text-sm text-gray-500 mb-4">
              Lee marcaciones de att2000.CHECKINOUT y las inserta en attendance_logs local.
              Primero importa empleados para asegurar el mapeo correcto.
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Tamano de lote</label>
                <input type="number" className="w-full border rounded px-3 py-2 text-sm"
                  value={importForm.batch_size} onChange={e => setImportForm(f => ({ ...f, batch_size: e.target.value }))} />
              </div>
            </div>
            <button onClick={handleImportPunches} disabled={importLoading}
              className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50">
              {importLoading ? 'Importando... esto puede tardar varios minutos' : 'Iniciar importacion historica'}
            </button>

            {importResult && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="font-medium text-blue-800 mb-2">Resultado importacion</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                  <div>Total leidos: <strong>{importResult.total_read?.toLocaleString()}</strong></div>
                  <div>En staging: <strong>{importResult.staged?.toLocaleString()}</strong></div>
                  <div>Importados: <strong>{importResult.imported?.toLocaleString()}</strong></div>
                  <div>Duplicados: <strong>{importResult.duplicates?.toLocaleString()}</strong></div>
                  <div>Errores: <strong>{importResult.errors}</strong></div>
                  <div>Run ID: <strong>#{importResult.run_id}</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Reconciliacion ───────────────────────────────── */}
      {tab === 'reconciliacion' && (
        <div>
          <div className="bg-white border rounded-lg p-6 max-w-xl mb-6">
            <h2 className="font-semibold text-lg mb-4">Reconciliar marcaciones</h2>
            <p className="text-sm text-gray-500 mb-4">
              Compara marcaciones en att2000 vs MySQL local por rango de fechas y detecta diferencias.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                <input type="date" className="w-full border rounded px-3 py-2 text-sm"
                  value={reconcileForm.date_from} onChange={e => setReconcileForm(f => ({ ...f, date_from: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                <input type="date" className="w-full border rounded px-3 py-2 text-sm"
                  value={reconcileForm.date_to} onChange={e => setReconcileForm(f => ({ ...f, date_to: e.target.value }))} />
              </div>
            </div>
            <button onClick={handleReconcile} disabled={reconcileLoading}
              className="w-full bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50">
              {reconcileLoading ? 'Reconciliando...' : 'Ejecutar reconciliacion'}
            </button>
            {reconcileResult && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-800">
                <strong>{reconcileResult.issues_found}</strong> diferencias encontradas (Run #{reconcileResult.run_id})
              </div>
            )}
          </div>

          <h3 className="font-medium text-gray-700 mb-3">Diferencias abiertas</h3>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">att2000</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Local</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reconcileResults.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin diferencias abiertas</td></tr>
                )}
                {reconcileResults.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{r.first_name} {r.last_name} <span className="text-gray-400 text-xs">({r.employee_code})</span></td>
                    <td className="px-4 py-2">{r.date}</td>
                    <td className="px-4 py-2 text-xs">{r.issue_type}</td>
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

      {/* ── Tab: Historial Runs ───────────────────────────────── */}
      {tab === 'runs' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Historial de sincronizaciones</h2>
            <button onClick={loadRuns} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">
              Actualizar
            </button>
          </div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entidad</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inicio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leidos</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insertados</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Omitidos</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Sin runs registrados</td></tr>
                )}
                {runs.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 text-xs">#{r.id}</td>
                    <td className="px-4 py-2">{r.sync_type}</td>
                    <td className="px-4 py-2">{r.entity_type}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-xs">{r.started_at ? new Date(r.started_at).toLocaleString('es-PY') : '—'}</td>
                    <td className="px-4 py-2 text-right">{r.total_read?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-green-700">{r.total_inserted?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-yellow-700">{r.total_skipped?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-red-700">{r.total_errors?.toLocaleString()}</td>
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
              Controla de donde provienen las marcaciones del sistema. Cambiar con cuidado.
            </p>
            <div className="grid gap-4">
              {[
                {
                  mode: 'legacy_att2000',
                  title: 'Fase A — Solo att2000',
                  description: 'Las marcaciones provienen exclusivamente de SQL Server att2000 via sincronizacion periodica. Usar durante la transicion inicial.',
                  color: 'border-yellow-400 bg-yellow-50',
                },
                {
                  mode: 'hybrid',
                  title: 'Fase B — Modo hibrido',
                  description: 'att2000 sincroniza en paralelo mientras el Bridge ZKTeco ya capta marcaciones directamente. Permite comparar y validar.',
                  color: 'border-blue-400 bg-blue-50',
                },
                {
                  mode: 'direct_only',
                  title: 'Fase C — Solo directo (Bridge/App)',
                  description: 'El sistema ya no consulta att2000. Las marcaciones entran exclusivamente por el Bridge ZKTeco o la app movil. Estado final.',
                  color: 'border-green-400 bg-green-50',
                },
              ].map(opt => (
                <div key={opt.mode} onClick={() => changeSourceMode(opt.mode)}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    sourceMode === opt.mode ? opt.color + ' ring-2 ring-offset-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-gray-900">{opt.title}</p>
                    {sourceMode === opt.mode && <span className="text-xs text-blue-700 font-medium">ACTIVO</span>}
                  </div>
                  <p className="text-sm text-gray-600">{opt.description}</p>
                  <p className="text-xs text-gray-400 mt-1 font-mono">{opt.mode}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
