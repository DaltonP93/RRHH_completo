'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { getSocket } from '@/lib/socket'

type DeviceAlert = {
  type: 'heartbeat_lost' | 'heartbeat_recovered'
  sn: string
  ip: string
  lastSeen?: string
  downtimeMs?: number
}

export default function DeviceAlertBanner() {
  const [alerts, setAlerts] = useState<Record<string, DeviceAlert>>({})

  useEffect(() => {
    const socket = getSocket()
    const onAlert = (ev: DeviceAlert) => {
      setAlerts(prev => {
        const next = { ...prev }
        if (ev.type === 'heartbeat_recovered') delete next[ev.sn]
        else next[ev.sn] = ev
        return next
      })
    }
    socket.on('device:alert', onAlert)
    return () => { socket.off('device:alert', onAlert) }
  }, [])

  const list = Object.values(alerts)
  if (list.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {list.map(a => (
        <div key={a.sn} className="bg-red-50 border border-red-300 rounded-xl shadow-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-red-800">Reloj sin respuesta</p>
            <p className="text-red-700 mt-0.5">SN <span className="font-mono">{a.sn}</span> ({a.ip})</p>
            {a.downtimeMs && (
              <p className="text-red-600 mt-0.5">
                Sin heartbeat hace {Math.round(a.downtimeMs / 60000)} min
              </p>
            )}
          </div>
          <button onClick={() => setAlerts(p => { const n = { ...p }; delete n[a.sn]; return n })}
                  className="text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
