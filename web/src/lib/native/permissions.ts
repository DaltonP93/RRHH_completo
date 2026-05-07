/**
 * lib/native/permissions.ts
 *
 * Estado de permisos unificado.
 * - Web Permissions API tiene buen soporte para 'geolocation' en todos los navegadores.
 * - 'camera' NO está soportado en Safari iOS — retorna 'unsupported'
 *   y el código UI cae a un fallback (intentar getUserMedia y manejar el error).
 */

export type PermName = 'geolocation' | 'camera'
export type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function queryPermission(name: PermName): Promise<PermState> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
    return 'unsupported'
  }
  try {
    // Safari iOS lanza TypeError para 'camera'
    const res = await navigator.permissions.query({ name: name as PermissionName })
    return res.state as PermState
  } catch {
    return 'unsupported'
  }
}

/**
 * Subscribe a cambios de estado del permiso. Útil para reaccionar
 * cuando el usuario concede el permiso desde Ajustes del navegador.
 */
export async function watchPermission(
  name: PermName,
  onChange: (s: PermState) => void
): Promise<() => void> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
    return () => {}
  }
  try {
    const res = await navigator.permissions.query({ name: name as PermissionName })
    onChange(res.state as PermState)
    const handler = () => onChange(res.state as PermState)
    res.addEventListener('change', handler)
    return () => res.removeEventListener('change', handler)
  } catch {
    return () => {}
  }
}
