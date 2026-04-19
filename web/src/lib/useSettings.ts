'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DisplayMode } from '@/lib/displayMode'

export type AppSettings = {
  system_name: string
  system_company: string
  system_primary_color: string
  employee_display_mode: DisplayMode
  [k: string]: any
}

export function useSettings() {
  const { data } = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/api/settings').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  return data || ({ employee_display_mode: 'full_name' } as AppSettings)
}

export function useDisplayMode(): DisplayMode {
  const s = useSettings()
  return (s.employee_display_mode as DisplayMode) || 'full_name'
}
