'use client'

import { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  showClose?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showClose = true
}: ModalProps) {
  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        'relative bg-[var(--card)] rounded-2xl shadow-xl border border-[var(--border)] w-full mx-4',
        'animate-in fade-in-0 zoom-in-95 duration-200',
        sizes[size]
      )}>
        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-start justify-between p-6 pb-0">
            <div>
              {title && (
                <h2 className="text-[18px] font-medium text-[var(--foreground)]">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-[14px] text-[var(--muted-foreground)] mt-1">
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <button
                onClick={onClose}
                className="p-2 -m-2 rounded-lg text-[var(--muted)] hover:text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

// Modal Footer helper
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 mt-6 pt-6 border-t border-[var(--border)]', className)}>
      {children}
    </div>
  )
}
