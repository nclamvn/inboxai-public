'use client'

import { useEffect, useRef } from 'react'
import { X, AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel, loading])

  if (!isOpen) return null

  const variantStyles = {
    danger: {
      icon: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
      button: 'bg-red-600 hover:bg-red-700 text-white'
    },
    warning: {
      icon: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
      button: 'bg-amber-600 hover:bg-amber-700 text-white'
    },
    default: {
      icon: 'bg-[var(--secondary)] text-[var(--muted-foreground)]',
      button: 'bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)]'
    }
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={() => !loading && onCancel()}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[var(--card)] rounded-xl shadow-lg border border-[var(--border)] w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-6 pb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${styles.icon}`}>
            <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-[var(--foreground)]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{message}</p>
          </div>
          <button
            onClick={() => !loading && onCancel()}
            disabled={loading}
            className="text-[var(--muted)] hover:text-[var(--muted-foreground)] transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[var(--secondary)] border-t border-[var(--border)]">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover)] rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${styles.button}`}
          >
            {loading && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
