'use client'
import Link from 'next/link'
import { Settings, CheckSquare, Clock } from 'lucide-react'

export default function CamposSensiblesPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Campos Sensibles</h1>
        <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium">
          <Clock size={14} /> En configuración
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Pasos pendientes</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-center gap-2"><CheckSquare size={14} className="text-slate-300" /> Configurar campos PII (datos de identificación personal)</li>
          <li className="flex items-center gap-2"><CheckSquare size={14} className="text-slate-300" /> Definir roles con acceso a campos sensibles</li>
          <li className="flex items-center gap-2"><CheckSquare size={14} className="text-slate-300" /> Activar enmascaramiento de datos en vistas públicas</li>
        </ul>
        <Link
          href="/configuracion"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Settings size={14} /> Ir a Configuración
        </Link>
      </div>
    </div>
  )
}
