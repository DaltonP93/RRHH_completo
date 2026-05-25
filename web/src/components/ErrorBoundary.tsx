'use client'
import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message || 'Error inesperado' }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
          <AlertTriangle className="text-rose-500" size={28} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Algo salió mal</h2>
        <p className="text-sm text-slate-500 max-w-sm mb-5">{this.state.message}</p>
        <button
          onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload() }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm hover:bg-slate-700"
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    )
  }
}
