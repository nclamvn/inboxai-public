'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, X, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  description?: string
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

// Simple global state for toasts
let toastState: ToastState | null = null
let listeners: Array<() => void> = []

function subscribe(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function notifyListeners() {
  listeners.forEach(l => l())
}

function createToastState(): ToastState {
  let toasts: Toast[] = []

  return {
    get toasts() {
      return toasts
    },
    addToast(toast) {
      const id = Math.random().toString(36).slice(2)
      toasts = [...toasts, { ...toast, id }]
      notifyListeners()

      // Auto remove after duration
      const duration = toast.duration ?? 4000
      if (duration > 0) {
        setTimeout(() => {
          this.removeToast(id)
        }, duration)
      }
    },
    removeToast(id) {
      toasts = toasts.filter(t => t.id !== id)
      notifyListeners()
    }
  }
}

function getToastState(): ToastState {
  if (!toastState) {
    toastState = createToastState()
  }
  return toastState
}

// Hook to use toasts
export function useToast() {
  const [, forceUpdate] = useState({})

  useEffect(() => {
    return subscribe(() => forceUpdate({}))
  }, [])

  return getToastState()
}

// Toast function for external use
export function toast(type: ToastType, message: string, description?: string, duration?: number) {
  getToastState().addToast({ type, message, description, duration })
}

// Toast container component
export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" strokeWidth={1.5} />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" strokeWidth={1.5} />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
      default:
        return <Info className="w-5 h-5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
    }
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 w-full md:w-[360px] p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-lg pointer-events-auto',
        'animate-slideUp'
      )}
    >
      {getIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--foreground)]">
          {toast.message}
        </p>
        {toast.description && (
          <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors"
      >
        <X className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
