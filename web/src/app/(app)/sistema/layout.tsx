'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser, isSuperAdmin } from '@/lib/useCurrentUser'

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const user = useCurrentUser()

  useEffect(() => {
    // Esperar a que el hook cargue el user de localStorage
    if (user === null) {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null
      if (!raw) { router.replace('/login'); return }
    }
    if (user && !isSuperAdmin(user)) {
      router.replace('/portal')
    }
  }, [user, router])

  if (user && !isSuperAdmin(user)) return null
  return <>{children}</>
}
