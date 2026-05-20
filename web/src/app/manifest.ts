/**
 * manifest.ts — Manifest dinámico de la PWA (Next.js 14 App Router)
 *
 * Next.js sirve este archivo en /manifest.webmanifest.
 * Permite que el ícono PWA sea personalizable desde
 * Configuración → Apariencia → Ícono PWA (system_pwa_icon_url).
 *
 * Si no hay ícono personalizado se usa el SVG por defecto.
 */
import type { MetadataRoute } from 'next'

const DEFAULT_ICON = '/icons/icon.svg'
const API_URL      = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '').replace(/\/api$/i, '')

async function getPwaIconUrl(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/api/settings`, {
      next: { revalidate: 300 }, // cachear 5 minutos
    })
    if (!res.ok) return DEFAULT_ICON
    const data = await res.json()
    return (data?.system_pwa_icon_url as string) || DEFAULT_ICON
  } catch {
    return DEFAULT_ICON
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const iconUrl = await getPwaIconUrl()

  // Iconos: el principal (custom o SVG por defecto) + maskable para Android
  // adaptive icons. Si los PNG 192/512 existen en /icons/, también se incluyen
  // como respaldo (Chrome Android prefiere PNG para algunos contextos).
  const isCustomSvg = iconUrl.endsWith('.svg')
  const icons: MetadataRoute.Manifest['icons'] = [
    {
      src:     iconUrl,
      sizes:   'any',
      type:    isCustomSvg ? 'image/svg+xml' : 'image/png',
      purpose: 'any',
    },
    // Versión maskable para Android adaptive icons
    {
      src:     iconUrl,
      sizes:   'any',
      type:    isCustomSvg ? 'image/svg+xml' : 'image/png',
      purpose: 'maskable',
    },
  ]
  // Si el ícono personalizado NO es SVG, incluir el SVG por defecto como respaldo
  if (!isCustomSvg) {
    icons.push({
      src:     DEFAULT_ICON,
      sizes:   'any',
      type:    'image/svg+xml',
      purpose: 'any',
    })
  }

  return {
    name:             'SisHoras — Sistema de Asistencia',
    short_name:       'SisHoras',
    description:      'Control de asistencia y marcación biométrica en tiempo real',
    start_url:        '/portal',
    scope:            '/',
    display:          'standalone',
    orientation:      'any',
    background_color: '#0f172a',
    theme_color:      '#2563eb',
    lang:             'es',
    categories:       ['business', 'productivity'],
    icons,
    shortcuts: [
      {
        name:        'Marcar asistencia',
        short_name:  'Marcar',
        description: 'Registrar entrada o salida',
        url:         '/marcar',
        icons:       [{ src: iconUrl, sizes: 'any' }],
      },
      {
        name:        'Mi asistencia',
        short_name:  'Historial',
        description: 'Ver mi historial de asistencia',
        url:         '/mi-asistencia',
        icons:       [{ src: iconUrl, sizes: 'any' }],
      },
      {
        name:        'Portal',
        short_name:  'Portal',
        description: 'Portal de módulos',
        url:         '/portal',
        icons:       [{ src: iconUrl, sizes: 'any' }],
      },
    ],
  }
}
