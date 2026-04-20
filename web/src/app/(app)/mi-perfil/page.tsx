'use client'
import { useEffect, useState } from 'react'
import { UserCircle2, Mail, Phone, Briefcase, Building2, Calendar, Hash, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface Me {
  user: {
    id: number; username: string; email: string | null
    full_name: string; role: string; last_login: string | null
    employee_id: number | null
  }
  employee: {
    id: number; code: string; first_name: string; last_name: string
    email: string | null; phone: string | null
    position: string | null; hire_date: string | null
    status: string; department: string | null
  } | null
}

export default function MiPerfilPage() {
  const [data, setData] = useState<Me | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/me')
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>
  if (error)   return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 max-w-xl">
        <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-red-900">{error}</div>
      </div>
    </div>
  )

  const { user, employee } = data!

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center">
          <UserCircle2 className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi perfil</h1>
          <p className="text-slate-500 text-sm">Datos de tu cuenta y empleado vinculado.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cuenta */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 border-b pb-2">Cuenta</h2>
          <Field icon={UserCircle2} label="Nombre completo" value={user.full_name} />
          <Field icon={Hash}        label="Usuario"         value={user.username} />
          <Field icon={Mail}        label="Email"           value={user.email || '—'} />
          <Field icon={Briefcase}   label="Rol"             value={user.role} />
          <Field icon={Calendar}    label="Último login"    value={user.last_login ? new Date(user.last_login).toLocaleString() : '—'} />
        </div>

        {/* Empleado */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 border-b pb-2">Empleado</h2>
          {!employee ? (
            <p className="text-slate-400 text-sm italic">
              Tu usuario no está vinculado a un empleado. Pedile a RRHH que te vincule para ver tu asistencia y pedir permisos.
            </p>
          ) : (
            <>
              <Field icon={UserCircle2} label="Nombre"       value={`${employee.first_name} ${employee.last_name}`} />
              <Field icon={Hash}        label="Código"       value={employee.code} />
              <Field icon={Briefcase}   label="Puesto"       value={employee.position || '—'} />
              <Field icon={Building2}   label="Departamento" value={employee.department || '—'} />
              <Field icon={Phone}       label="Teléfono"     value={employee.phone || '—'} />
              <Field icon={Calendar}    label="Ingreso"      value={employee.hire_date || '—'} />
              <Field icon={Briefcase}   label="Estado"       value={employee.status} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon size={16} className="text-slate-400 shrink-0" />
      <span className="text-slate-500 w-32 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium truncate">{value}</span>
    </div>
  )
}
