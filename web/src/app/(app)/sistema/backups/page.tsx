'use client'
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Archive, RefreshCw, Download, Trash2, Plus, AlertTriangle, HardDrive } from 'lucide-react'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function bytesToHuman(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function BackupsPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get('/api/backups').then(r => r.data),
    refetchInterval: 30_000,
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/api/backups').then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      alert('Backup generado correctamente ✅')
    },
    onError: (e: any) => alert(e?.response?.data?.error || 'Error al generar backup'),
  })

  const purgeMut = useMutation({
    mutationFn: () => api.post('/api/backups/purge').then(r => r.data),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      alert(`Purga completada: ${d.removed} backup(s) viejos eliminados`)
    },
  })

  async function deleteBackup(filename: string) {
    if (!confirm(`¿Eliminar backup "${filename}"? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/api/backups/${encodeURIComponent(filename)}`)
      qc.invalidateQueries({ queryKey: ['backups'] })
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al eliminar')
    }
  }

  const backups: any[] = data?.backups || []
  const totalSize = backups.reduce((a, b) => a + (b.size || 0), 0)

  async function handleCreate() {
    setCreating(true)
    try { await createMut.mutateAsync() }
    finally { setCreating(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-500 flex items-center justify-center">
            <Archive className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Backups de Base de Datos</h1>
            <p className="text-sm text-slate-500">
              Backups comprimidos (gzip) de MySQL.
              {' '}Retención: {data?.retention_days || 14} días.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-3 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors">
            <RefreshCw size={14} /> Actualizar
          </button>
          <button onClick={handleCreate} disabled={creating || createMut.isPending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus size={14} /> {creating ? 'Generando...' : 'Backup manual'}
          </button>
          <button onClick={() => purgeMut.mutate()} disabled={purgeMut.isPending}
            className="flex items-center gap-2 border border-rose-200 text-rose-600 px-3 py-2 rounded-xl text-sm hover:bg-rose-50 transition-colors">
            <Trash2 size={14} /> Purgar viejos
          </button>
        </div>
      </div>

      {/* Aviso */}
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold mb-0.5">Backup automático diario</p>
          <p>Por defecto el sistema genera un backup todos los días a las 02:00 AM. Configurable con la variable de entorno <code className="bg-amber-100 px-1.5 rounded text-xs">BACKUP_CRON</code>. Los backups se almacenan en <code className="bg-amber-100 px-1.5 rounded text-xs">api/backups/</code> y se eliminan automáticamente después de la retención.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 uppercase font-medium mb-1">Total backups</p>
          <p className="text-3xl font-bold text-slate-900">{backups.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 uppercase font-medium mb-1">Espacio usado</p>
          <p className="text-3xl font-bold text-slate-900">{bytesToHuman(totalSize)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 uppercase font-medium mb-1">Último backup</p>
          <p className="text-sm font-bold text-slate-900">
            {backups[0] ? format(new Date(backups[0].created_at), "d 'de' MMM 'a las' HH:mm", { locale: es }) : '—'}
          </p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading && (
          <div className="text-center py-12 text-slate-400">
            <RefreshCw size={20} className="mx-auto mb-2 animate-spin opacity-40" />
            Cargando backups...
          </div>
        )}
        {!isLoading && backups.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <HardDrive size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin backups disponibles</p>
            <p className="text-xs mt-1">Genera el primero con el botón "Backup manual"</p>
          </div>
        )}
        {!isLoading && backups.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Archivo</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Generado</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-xs">Tamaño</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-xs w-44">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {backups.map((b: any) => (
                <tr key={b.filename} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{b.filename}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(b.created_at), "d MMM yyyy HH:mm:ss", { locale: es })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{bytesToHuman(b.size)}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/api/backups/${encodeURIComponent(b.filename)}`} download
                      className="inline-flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors">
                      <Download size={13} /> Descargar
                    </a>
                    <button onClick={() => deleteBackup(b.filename)}
                      className="inline-flex items-center gap-1 text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ml-1">
                      <Trash2 size={13} /> Eliminar
                    </button>
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
