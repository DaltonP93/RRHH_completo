'use client'
import { useEffect, useState } from 'react'
import { QrCode, Copy, Download, RefreshCw, Settings } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'
import EmptyState from '@/components/ui/EmptyState'

interface Branch {
  id: number
  name: string
  code?: string
  address?: string
}

export default function QRAsistenciaPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<number | null>(null)
  const [regenerating, setRegenerating] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get('/api/branches')
      .then(r => setBranches(r.data || []))
      .catch(() => [])
      .finally(() => setLoading(false))
  }, [])

  function getQrLink(branch: Branch) {
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/checkin?branch=${branch.id}`
  }

  async function copyLink(branch: Branch) {
    try {
      await navigator.clipboard.writeText(getQrLink(branch))
      setCopied(branch.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {}
  }

  function handleRegenerate(branchId: number) {
    setRegenerating(branchId)
    // Disabled placeholder — future implementation
    setTimeout(() => setRegenerating(null), 1200)
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <EnterprisePageHeader
        icon={QrCode}
        iconColor="bg-indigo-600"
        title="QR de Asistencia"
        subtitle="Códigos QR para marcación sin reloj biométrico"
        breadcrumbs={[
          { label: 'Configuración', href: '/configuracion' },
          { label: 'QR Asistencia' },
        ]}
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <QrCode size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          <strong>Los empleados pueden escanear este QR</strong> para registrar entrada/salida desde su teléfono.
          Cada sucursal tiene su propio código. Mantén la pantalla abierta en un monitor o tablet en la entrada.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-2/3 mb-3" />
              <div className="w-full aspect-square bg-slate-100 rounded-lg mb-3" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200">
          <EmptyState
            icon={QrCode}
            title="Sin sucursales configuradas"
            description="Configura al menos una sucursal para generar los códigos QR de marcación."
            action={{ label: 'Ir a configuración', onClick: () => window.location.href = '/configuracion' }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(branch => (
            <div key={branch.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
              {/* Card header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{branch.name}</p>
                  {branch.code && (
                    <p className="text-xs text-slate-400 font-mono">{branch.code}</p>
                  )}
                  {branch.address && (
                    <p className="text-xs text-slate-400 truncate max-w-[180px]">{branch.address}</p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium ring-1 ring-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Activo
                </span>
              </div>

              {/* QR placeholder */}
              <div className="p-5 flex flex-col items-center gap-3 flex-1">
                <div className="w-full aspect-square max-w-[200px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400">
                  <QrCode size={48} />
                  <span className="text-xs">Sucursal #{branch.id}</span>
                </div>

                <p className="text-[11px] text-slate-400 text-center font-mono truncate w-full px-1">
                  /checkin?branch={branch.id}
                </p>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 grid grid-cols-3 gap-2">
                <button
                  onClick={() => copyLink(branch)}
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600 text-xs"
                >
                  <Copy size={14} />
                  {copied === branch.id ? 'Copiado' : 'Copiar'}
                </button>

                <button
                  disabled
                  title="Próximamente"
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg border border-slate-100 text-slate-300 text-xs cursor-not-allowed"
                >
                  <Download size={14} />
                  Descargar
                </button>

                <button
                  onClick={() => handleRegenerate(branch.id)}
                  disabled={regenerating === branch.id}
                  title="Próximamente"
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg border border-slate-100 text-slate-300 text-xs cursor-not-allowed"
                >
                  <RefreshCw size={14} className={regenerating === branch.id ? 'animate-spin' : ''} />
                  Regenerar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
        <Settings size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-700">
          <strong>Tip:</strong> mantén esta pantalla abierta en un monitor/tablet en la entrada de la sede.
          Las funciones de descarga y regeneración de QR estarán disponibles en la próxima versión.
        </p>
      </div>
    </div>
  )
}
