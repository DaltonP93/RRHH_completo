'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Props {
  /** Si se pasa, va a esa URL específica. Sino, usa router.back(). */
  href?: string
  /** Texto opcional (default: "Volver"). */
  label?: string
  className?: string
}

/**
 * Botón "Volver" reutilizable.
 * Por defecto usa router.back(). Si se pasa `href`, navega a esa ruta.
 */
export default function BackButton({ href, label = 'Volver', className = '' }: Props) {
  const router = useRouter()

  if (href) {
    return (
      <Link href={href}
        className={`inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${className}`}>
        <ArrowLeft size={15} aria-hidden="true" />
        {label}
      </Link>
    )
  }

  return (
    <button onClick={() => router.back()}
      className={`inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${className}`}>
      <ArrowLeft size={15} aria-hidden="true" />
      {label}
    </button>
  )
}
