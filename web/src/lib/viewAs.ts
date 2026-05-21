// Stores a simulated role/user for super_admin to preview the system as another role
export type ViewAsState = { userId: number; username: string; role: string } | null

export function getViewAs(): ViewAsState {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(sessionStorage.getItem('view_as') || 'null') } catch { return null }
}

export function setViewAs(state: ViewAsState) {
  if (state) sessionStorage.setItem('view_as', JSON.stringify(state))
  else sessionStorage.removeItem('view_as')
  window.dispatchEvent(new Event('viewas-change'))
}
