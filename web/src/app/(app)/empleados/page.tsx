'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, UserCheck, UserX, TrendingUp } from 'lucide-react'
import { employeesApi } from '@/lib/api'
import Link from 'next/link'

export default function EmpleadosPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, status],
    queryFn: () => employeesApi.list({ search, status, limit: 100 }),
    staleTime: 30_000,
  })

  const employees = data?.data || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Empleados</h1>
        <Link href="/empleados/nuevo"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={16} /> Nuevo empleado
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Código</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Departamento</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Horario</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-slate-500">{emp.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                        {emp.first_name?.[0]}{emp.last_name?.[0]}
                      </div>
                      <span className="font-medium text-slate-900">{emp.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{emp.department || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {emp.check_in && emp.check_out
                      ? `${emp.check_in.slice(0,5)} – ${emp.check_out.slice(0,5)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                      emp.status === 'active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {emp.status === 'active' ? <UserCheck size={12} /> : <UserX size={12} />}
                      {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Link href={`/analytics/${emp.id}`}
                        className="text-purple-500 hover:text-purple-700 p-1.5 rounded-lg hover:bg-purple-50 transition-colors" title="Analytics">
                        <TrendingUp size={14} />
                      </Link>
                      <Link href={`/empleados/${emp.id}`}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                        Ver →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">{data?.total || 0} empleados encontrados</p>
    </div>
  )
}
