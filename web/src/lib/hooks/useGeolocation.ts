'use client'
import { useCallback, useState } from 'react'
import { Coords, GeoError, getCurrentPosition } from '@/lib/native/geolocation'

interface State {
  loading: boolean
  coords:  Coords    | null
  error:   GeoError  | null
}

/**
 * Hook para obtener la posición actual a demanda.
 * - No solicita el permiso al montar (se pide al llamar request()).
 * - Retorna estado reactivo + función request() que devuelve la promesa.
 */
export function useGeolocation() {
  const [state, setState] = useState<State>({ loading: false, coords: null, error: null })

  const request = useCallback(async (): Promise<Coords> => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const c = await getCurrentPosition({ timeout: 12_000 })
      setState({ loading: false, coords: c, error: null })
      return c
    } catch (e) {
      const err = e instanceof GeoError ? e : new GeoError('POSITION_UNAVAILABLE', String(e))
      setState({ loading: false, coords: null, error: err })
      throw err
    }
  }, [])

  return { ...state, request }
}
