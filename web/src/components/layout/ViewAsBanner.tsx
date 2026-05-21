'use client'
import { useEffect, useState } from 'react'
import { getViewAs, setViewAs, ViewAsState } from '@/lib/viewAs'

export default function ViewAsBanner() {
  const [viewAs, setViewAsState] = useState<ViewAsState>(null)

  useEffect(() => {
    setViewAsState(getViewAs())

    function handleChange() {
      setViewAsState(getViewAs())
    }

    window.addEventListener('viewas-change', handleChange)
    return () => window.removeEventListener('viewas-change', handleChange)
  }, [])

  if (!viewAs) return null

  function handleExit() {
    setViewAs(null)
    window.location.reload()
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-md">
      <span>
        👁 Viendo como <strong>{viewAs.username}</strong> ({viewAs.role}) —{' '}
      </span>
      <button
        onClick={handleExit}
        className="underline font-bold hover:text-amber-950 transition-colors"
      >
        Salir
      </button>
    </div>
  )
}
