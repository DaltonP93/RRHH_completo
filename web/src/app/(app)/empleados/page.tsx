'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, UserCheck, UserX, TrendingUp, Download, ChevronDown, Filter, Users } from 'lucide-react'
import { employeesApi, api } from '@/lib/api'
import Link from 'next/link'
import { format } from 'date-fns'

// ─── Exportar CSV/TXT ─────────────────────────────────────────────
function exportData(employees: any[], fmt: 'csv' | 'txt') {
  const filename = `empleados_${format(new Date(), 'yyyyMMdd')}.${fmt}`

  if (fmt === 'csv') {
    const header = ['Código','Nombre','Apellido','Nombre Completo','Departamento','Cargo','Email','Teléfono','Horario Entrada','Horario Salida','Estado','Fecha Alta']
    const rows = employees.map(e => [
      e.code, `"${e.first_name || ''}"`, `"${e.last_name || ''}"`, `"${e.full_name || ''}"`,
      `"${e.department || ''}"`, `"${e.position || ''}"`, e.email || '',
      e.phone || '', e.check_in || '', e.check_out || '',
      e.status === 'active' ? 'Activo' : 'Inactivo', e.created_at?.slice(0,10) || ''
    ].join(','))
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)

  } else {
    const lines = [
      `LISTADO DE EMPLEADOS — ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
      '═'.repeat(70),
      ...employees.map((e, i) => [
        `${String(i + 1).padStart(3, '0')}. [${e.code}] ${e.full_name}`,
        `     Departamento: ${e.department || 'Sin asignar'}  |  Cargo: ${e.position || '—'}`,
        `     Horario: ${e.check_in ? e.check_in.slice(0,5) + ' – ' + (e.check_out?.slice(0,5) || '') : '—'}  |  Estado: ${e.status === 'active' ? 'Activo' : 'Inactivo'}`,
        e.email ? `     Email: ${e.email}` : '',
      ].filter(Boolean).join('\n')),
      '═'.repeat(70),
      `Total: ${employees.length} empleados`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
  }
}

// ─── Dropdown de exportar ─────────────────────────────────────────
function ExportDropdown({ employees }: { employees: any[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} disabled={employees.length === 0}
        className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors">
        <Download size={15} /> Exportar <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden min-w-[160px]">
            <button onClick={() => { exportData(employees, 'csv'); setOpen(false) }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <span className="text-green-600 font-bold text-xs">CSV</span>
              <span className="text-slate-700">Exportar a CSV</span>
            </button>
            <button onClick={() => { exportData(employees, 'txt'); setOpen(false) }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-center gap-2">
              <span className="text-slate-600 font-bold text-xs">TXT</span>
              <span className="text-slate-700">Exportar a TXT</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export default function EmpleadosPage() {
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('active')
  const [dept, setDept]       = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/api/employees/departments').then(r => r.data),
    staleTime: 300_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, status, dept],
    queryFn: () => employeesApi.list({
      search: search || undefined,
      status: status || 'all',
      dept: dept || undefined,
      limit: 500,
    }),
    staleTime: 30_000,
  })

  const employees = data?.data || []
  const active   = employees.filter((e: any) => e.status === 'active').length
  const inactive = employees.filter((e: any) => e.status === 'inactive').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Users className="text-blue-600" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Empleados</h1>
            <p className="text-sm text-slate-500">
              {data?.total || 0} empleados en total · {active} activos
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportDropdown employees={employees} />
          <Link href="/empleados/nuevo"
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Nuevo empleado
          </Link>
        </div>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total empleados</p>
          <p className="text-3xl font-bold text-slate-700 mt-1">{data?.total || 0}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Activos</p>
          <p className="text-3xl font-bold text-green-700 mt-1">{active}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Inactivos</p>
          <p className="text-3xl font-bold text-slate-500 mt-1">{inactive}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-slate-100 shadow-sm rounded-2xl px-5 py-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <select value={dept} onChange={e => setDept(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los departamentos</option>
          {(deptsData || []).map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <select value={status} onChange={e => setStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <Users size={32} className="mx-auto mb-3 opacity-40 animate-pulse" />
            Cargando empleados...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Código</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Departamento</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Cargo</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Horario</th>
                <th className="text-center px-4 py-3 text-slate-600 font-medium">Estado</th>
                <th className="px-4 py-3 text-right text-slate-600 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3 font-mono text-slate-400 text-xs">{emp.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                        {emp.first_name?.[0]}{emp.last_name?.[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{emp.full_name}</p>
                        {emp.email && <p className="text-xs text-slate-400">{emp.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-sm">{emp.department || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{emp.position || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    {emp.check_in && emp.check_out
                      ? `${emp.check_in.slice(0,5)} – ${emp.check_out.slice(0,5)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      emp.status === 'active'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {emp.status === 'active' ? <UserCheck size={11} /> : <UserX size={11} />}
                      {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Link href={`/analytics/${emp.id}`}
                        className="p-1.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Ver analytics">
                        <TrendingUp size={14} />
                      </Link>
                      <Link href={`/empleados/${emp.id}`}
                        className="px-3 py-1.5 text-blue-600 hover:text-blue-800 text-xs font-semibold hover:bg-blue-50 rounded-xl transition-colors">
                        Ver perfil →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-slate-400">
                    <Users size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Sin resultados</p>
                    <p className="text-xs mt-1">Ajuste los filtros de búsqueda</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">{employees.length} empleados mostrados</p>
    </div>
  )
}
