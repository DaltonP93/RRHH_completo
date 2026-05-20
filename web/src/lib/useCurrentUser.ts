'use client'
import { useEffect, useState } from 'react'

export type Role =
  | 'super_admin' | 'admin' | 'gth' | 'coordinator' | 'manager'
  | 'gestor' | 'hr' | 'supervisor' | 'employee'

export interface CurrentUser {
  id: number
  username: string
  fullName?: string
  email?: string
  role: Role
  employee_id?: number | null
}

/**
 * Ruta de aterrizaje tras login según rol.
 */
export function landingFor(role: Role): string {
  switch (role) {
    case 'super_admin':
    case 'admin':
    case 'gth':
    case 'hr':
    case 'gestor':
    case 'supervisor':
      return '/portal'
    case 'coordinator':
    case 'manager':
      return '/aprobaciones'
    case 'employee':
      return '/mi-portal'
    default:
      return '/dashboard'
  }
}

function readUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) as CurrentUser : null
  } catch { return null }
}

/**
 * Lee el usuario actual desde localStorage. No hace fetch — lo pueblan
 * los componentes de login en su handleSubmit.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    setUser(readUser())
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'user') setUser(readUser())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return user
}

export function hasRole(user: CurrentUser | null, ...roles: Role[]) {
  if (!user) return false
  if (user.role === 'super_admin') return true
  return roles.includes(user.role)
}

export function isSuperAdmin(user: CurrentUser | null) {
  return user?.role === 'super_admin'
}
