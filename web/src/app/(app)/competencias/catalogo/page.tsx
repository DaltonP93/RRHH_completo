'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Clock } from 'lucide-react'
import { api } from '@/lib/api'

interface Course {
  id: number
  nombre: string
  descripcion: string
  duracion_horas: number
  modalidad: string
}

const MODALIDAD_CLASS: Record<string, string> = {
  presencial: 'bg-blue-50 text-blue-700',
  virtual:    'bg-violet-50 text-violet-700',
  hibrida:    'bg-amber-50 text-amber-700',
}

export default function CatalogoPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/courses')
      .then(r => setCourses(r.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-slate-500" />
          Catálogo de Cursos
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Biblioteca de cursos disponibles para el desarrollo del personal
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-lg" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center py-14 text-slate-400">
          <BookOpen className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No hay cursos en el catálogo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map(c => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 leading-tight">{c.nombre}</p>
                <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${MODALIDAD_CLASS[c.modalidad] ?? 'bg-slate-100 text-slate-600'}`}>
                  {c.modalidad}
                </span>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">{c.descripcion}</p>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                <span>{c.duracion_horas} horas</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
