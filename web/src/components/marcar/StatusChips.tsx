'use client'
import { Wifi, WifiOff, MapPin, MapPinOff, Camera, CameraOff } from 'lucide-react'
import type { PermState } from '@/lib/native/permissions'

interface Props {
  online:    boolean
  gps:       PermState
  camera:    PermState
}

/**
 * Tres chips de estado en la parte superior de /marcar:
 *  - Conexión (online/offline)
 *  - GPS (granted/denied/prompt/unsupported)
 *  - Cámara (granted/denied/prompt/unsupported)
 *
 * El estado se reactiva automáticamente cuando el usuario concede permisos
 * desde Ajustes del navegador.
 */
export default function StatusChips({ online, gps, camera }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <Chip
        ok={online}
        labelOk="Online"
        labelOff="Offline"
        IconOk={Wifi}
        IconOff={WifiOff}
      />
      <Chip
        ok={gps === 'granted'}
        labelOk="GPS OK"
        labelOff={gps === 'denied' ? 'GPS bloqueado' : 'GPS pendiente'}
        IconOk={MapPin}
        IconOff={MapPinOff}
        warn={gps === 'prompt' || gps === 'unsupported'}
      />
      <Chip
        ok={camera === 'granted'}
        labelOk="Cámara OK"
        labelOff={camera === 'denied' ? 'Cámara bloqueada' : 'Cámara pendiente'}
        IconOk={Camera}
        IconOff={CameraOff}
        warn={camera === 'prompt' || camera === 'unsupported'}
      />
    </div>
  )
}

function Chip({
  ok, labelOk, labelOff, IconOk, IconOff, warn,
}: {
  ok: boolean
  labelOk: string
  labelOff: string
  IconOk: any
  IconOff: any
  warn?: boolean
}) {
  const color =
    ok          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : warn      ? 'bg-amber-50   text-amber-700   border-amber-200'
                : 'bg-red-50     text-red-700     border-red-200'
  const Icon = ok ? IconOk : IconOff
  return (
    <div className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 font-medium ${color}`}>
      <Icon size={13} aria-hidden="true" />
      <span className="truncate">{ok ? labelOk : labelOff}</span>
    </div>
  )
}
