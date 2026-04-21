import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { SwRegister } from '@/components/SwRegister'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sistema de Asistencia — RH',
  description: 'Control de asistencia en tiempo real',
  manifest: '/manifest.webmanifest',
  applicationName: 'SisHoras',
  appleWebApp: { capable: true, title: 'SisHoras', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <SwRegister />
      </body>
    </html>
  )
}
