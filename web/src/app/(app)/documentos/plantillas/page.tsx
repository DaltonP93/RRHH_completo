'use client'

import { useEffect, useState } from 'react'
import { FileCode, Plus } from 'lucide-react'
import { api } from '@/lib/api'

interface Template {
  id: number
  nombre: string
  codigo: string
  modulo: string
  version: string
  estado: 'active' | 'deprecated'
}

const MODULE_COLORS: Record<string, string> = {
  nomina: 'bg-purple-50 text-purple-700',
  asistencia: 'bg-blue-50 text-blue-700',
  liquidacion: 'bg-amber-50 text-amber-700',
  contratos: 'bg-teal-50 text-teal-700',
}

export default function PlantillasPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/document-templates')
      .then(r => setTemplates(r.data ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-slate-500" />
            Plantillas de Documentos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Plantillas HTML para generar documentos laborales automatizados
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Nueva plantilla
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Plantillas configuradas
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <FileCode className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay plantillas configuradas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Nombre', 'Código', 'Módulo', 'Versión', 'Estado'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{t.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{t.codigo}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${MODULE_COLORS[t.modulo] ?? 'bg-slate-100 text-slate-600'}`}>
                      {t.modulo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">v{t.version}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.estado === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.estado === 'active' ? 'Activa' : 'Deprecada'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
