'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHydrated } from '@/hooks/use-hydrated'
import { Button } from './button'

const modalSizes = {
  xs: 'max-w-xs', sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl',
  '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', full: 'max-w-none',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  size?: keyof typeof modalSizes
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  showCloseButton?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  className?: string
}

export function Modal({
  open, onClose, size = 'md', title, description, footer, children,
  showCloseButton = true, closeOnOverlayClick = true, closeOnEscape = true, className,
}: ModalProps) {
  const mounted = useHydrated()
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const startedOnBackdrop = useRef(false)

  useEffect(() => {
    const element = dialog.current
    if (!open || !mounted || !element) return
    const opener = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [open, mounted])

  if (!open || !mounted) return null

  return createPortal(
    <dialog
      ref={dialog}
      className={cn('neo-dialog', modalSizes[size], className)}
      aria-labelledby={title ? id + '-title' : undefined}
      aria-label={!title ? 'Hộp thoại' : undefined}
      aria-describedby={description ? id + '-description' : undefined}
      onCancel={event => {
        event.preventDefault()
        if (closeOnEscape) onClose()
      }}
      onPointerDown={event => { startedOnBackdrop.current = event.target === event.currentTarget }}
      onClick={event => {
        if (closeOnOverlayClick && startedOnBackdrop.current && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="p-4 sm:p-6">
        {(title || description || showCloseButton) && (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {title && <h2 id={id + '-title'} className="text-lg font-semibold leading-6">{title}</h2>}
              {description && <p id={id + '-description'} className="mt-2 text-sm text-[var(--foreground-muted)]">{description}</p>}
            </div>
            {showCloseButton && (
              <button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="neo-icon-button -my-2 -me-2">
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </dialog>, document.body,
  )
}

export interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  loading?: boolean
}

export function ConfirmModal({
  open, onClose, onConfirm, title, description, confirmText = 'Xác nhận',
  cancelText = 'Hủy', variant = 'default', loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open} onClose={onClose} title={title} description={description} size="sm"
      showCloseButton={false} closeOnEscape={!loading} closeOnOverlayClick={!loading}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>{cancelText}</Button>
          <Button type="button" variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    />
  )
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4', className)}>{children}</div>
}

export default Modal
