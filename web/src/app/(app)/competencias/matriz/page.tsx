'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Grid3x3, Users } from 'lucide-react';

interface Competency { id: number; name: string; competency_type: string; description?: string }
interface Employee { id: number; first_name: string; last_name: string; department?: string }

export default function MatrizPage() {
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/competencies?limit=20'),
      api.get('/api/employees?status=active&limit=15'),
    ])
      .then(([r1, r2]) => {
        setCompetencies(Array.isArray(r1.data) ? r1.data : (r1.data?.data || []));
        const emp = Array.isArray(r2.data) ? r2.data : (r2.data?.data || []);
        setEmployees(emp.slice(0, 15));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const typeColor: Record<string, string> = {
    generic: 'bg-slate-100 text-slate-600',
    technical: 'bg-blue-100 text-blue-700',
    behavioral: 'bg-purple-100 text-purple-700',
    leadership: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Grid3x3 size={20} className="text-slate-500" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Matriz de Competencias</h1>
          <p className="text-xs text-slate-500">Vista cruzada empleados × competencias</p>
        </div>
      </div>

      {loading ? (
        <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
      ) : competencies.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <Grid3x3 size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No hay competencias definidas aún</p>
          <p className="text-xs text-slate-400 mt-1">Definí competencias en el módulo de Competencias para ver la matriz</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-auto">
          <table className="text-xs min-w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50 min-w-[160px]">
                  <div className="flex items-center gap-1.5"><Users size={12} /> Empleado</div>
                </th>
                {competencies.map(c => (
                  <th key={c.id} className="text-center px-3 py-2.5 min-w-[100px]">
                    <div className="text-[10px] font-semibold text-slate-600 truncate max-w-[90px]" title={c.name}>
                      {c.name}
                    </div>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium mt-0.5 ${typeColor[c.competency_type] || typeColor.generic}`}>
                      {c.competency_type}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employees.map(e => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-700 sticky left-0 bg-white">
                    {e.first_name} {e.last_name}
                    {e.department && <div className="text-[10px] text-slate-400">{e.department}</div>}
                  </td>
                  {competencies.map(c => (
                    <td key={c.id} className="px-3 py-2.5 text-center text-slate-300">
                      <div className="w-6 h-6 mx-auto rounded border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-300">
                        —
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
            <p className="text-[10px] text-slate-400">Las evaluaciones de competencias completadas se mostrarán en esta matriz.</p>
          </div>
        </div>
      )}
    </div>
  );
}
