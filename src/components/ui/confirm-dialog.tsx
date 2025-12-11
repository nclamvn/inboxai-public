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
      icon: 'bg-red-50 text-red-600',
      button: 'bg-red-600 hover:bg-red-700 text-white'
    },
    warning: {
      icon: 'bg-amber-50 text-amber-600',
      button: 'bg-amber-600 hover:bg-amber-700 text-white'
    },
    default: {
      icon: 'bg-[#F5F5F5] text-[#6B6B6B]',
      button: 'bg-[#1A1A1A] hover:bg-[#2A2A2A] text-white'
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
        className="relative bg-white rounded-md shadow-lg w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-6 pb-4">
          <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${styles.icon}`}>
            <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
            <p className="mt-1 text-sm text-[#6B6B6B]">{message}</p>
          </div>
          <button
            onClick={() => !loading && onCancel()}
            disabled={loading}
            className="text-[#9B9B9B] hover:text-[#6B6B6B] transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#FAFAFA] border-t border-[#EBEBEB]">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-md transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-2 ${styles.button}`}
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
