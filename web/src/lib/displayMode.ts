/**
 * displayMode.ts
 * Cómo mostrar los nombres de empleados en toda la UI.
 *
 * Modos:
 *   'full_name' → "Juan García"  (default, si hay nombre real)
 *   'code_name' → "[3081] Juan García"  (muestra code y nombre)
 *   'code_only' → "3081"  (solo code — útil cuando el ZKTeco no tiene nombres cargados)
 *
 * El valor se lee de GET /api/settings.employee_display_mode
 */

export type DisplayMode = 'full_name' | 'code_name' | 'code_only'

export function formatEmployee(
  emp: { code?: string | number; first_name?: string; last_name?: string; full_name?: string } | null | undefined,
  mode: DisplayMode = 'full_name'
): string {
  if (!emp) return ''
  const code = String(emp.code ?? '')
  const fullName = (emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`).trim()

  // Fallback: si no hay nombre real (ej. viene como "1" o vacío), mostrar code
  const hasRealName = fullName && !/^\d+$/.test(fullName) && fullName.length > 1

  switch (mode) {
    case 'code_only':
      return code || fullName
    case 'code_name':
      return hasRealName ? `[${code}] ${fullName}` : code
    case 'full_name':
    default:
      return hasRealName ? fullName : (code || fullName)
  }
}

export function formatEmployeeInitials(
  emp: { code?: string | number; first_name?: string; last_name?: string } | null | undefined,
  mode: DisplayMode = 'full_name'
): string {
  if (!emp) return '?'
  const fn = emp.first_name || ''
  const ln = emp.last_name || ''
  const hasReal = (fn + ln).trim() && !/^\d+$/.test((fn + ln).trim())

  if (mode === 'code_only' || !hasReal) {
    return String(emp.code ?? '?').slice(-2).toUpperCase()
  }
  return (fn[0] || '') + (ln[0] || '')
}
