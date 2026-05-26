'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { api } from '@/lib/api'

function ExportCard({
  title, description, endpoint, periodType,
}: {
  title: string
  description: string
  endpoint: string
  periodType: 'month' | 'year'
}) {
  const [period, setPeriod] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleGenerate() {
    if (!period) return
    setBusy(true)
    setMsg('')
    try {
      await api.post(endpoint, { period })
      setMsg('Archivo generado correctamente')
    } catch {
      setMsg('Error al generar el archivo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
        <p className="text-sm text-slate-600 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type={periodType === 'year' ? 'number' : 'month'}
          value={period}
          onChange={e => setPeriod(e.target.value)}
          placeholder={periodType === 'year' ? '2025' : 'YYYY-MM'}
          className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleGenerate}
          disabled={busy || !period}
          aria-busy={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {busy ? 'Generando…' : 'Generar'}
        </button>
      </div>
      {msg && <p className="text-xs text-slate-500">{msg}</p>}
    </div>
  )
}

export default function ExportacionesPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Download className="w-5 h-5 text-slate-500" />
          Exportaciones MTESS / IPS
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Generación de archivos para presentación ante organismos reguladores
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ExportCard
          title="Planilla REOP (MTESS)"
          description="Registro de Obras y Personas. Seleccione el período mensual a exportar."
          endpoint="/api/compliance/mtess"
          periodType="month"
        />
        <ExportCard
          title="Nómina IPS (REI)"
          description="Registro de Empleados y sus aportes para presentación al IPS."
          endpoint="/api/compliance/ips"
          periodType="month"
        />
        <ExportCard
          title="Planilla Anual MTESS"
          description="Declaración anual de nómina y remuneraciones ante el MTESS."
          endpoint="/api/compliance/mtess"
          periodType="year"
        />
      </div>
    </div>
  )
}
