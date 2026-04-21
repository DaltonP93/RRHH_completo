'use client'
import Link from 'next/link'
import { ArrowLeft, Palette } from 'lucide-react'

export default function AparienciaPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/configuracion"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Volver
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow p-8 border border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Palette size={20} className="text-blue-600" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Apariencia</h1>
            <p className="text-sm text-slate-500">Personalización visual del sistema</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Esta sección se encuentra temporalmente en mantenimiento. Los ajustes
          de marca, colores, logo y pantalla de login pueden configurarse por
          ahora directamente desde la base de datos en la tabla
          <code className="mx-1 px-1 bg-amber-100 rounded">site_settings</code>
          o desde el endpoint <code className="mx-1 px-1 bg-amber-100 rounded">/api/settings</code>.
        </div>
      </div>
    </div>
  )
}
