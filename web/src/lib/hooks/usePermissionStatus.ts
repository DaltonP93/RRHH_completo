'use client'
import { useEffect, useState } from 'react'
import { PermName, PermState, queryPermission, watchPermission } from '@/lib/native/permissions'

/**
 * Estado reactivo de un permiso del navegador.
 * Se actualiza automáticamente cuando el usuario lo concede/deniega
 * (donde el navegador soporta el evento 'change' en PermissionStatus).
 */
export function usePermissionStatus(name: PermName): PermState {
  const [state, setState] = useState<PermState>('prompt')

  useEffect(() => {
    let cleanup: (() => void) | undefined
    let alive = true

    queryPermission(name).then(s => { if (alive) setState(s) })
    watchPermission(name, s => { if (alive) setState(s) }).then(fn => { cleanup = fn })

    return () => { alive = false; cleanup?.() }
  }, [name])

  return state
}
