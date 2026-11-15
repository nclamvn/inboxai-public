'use client'

import { ConfirmModal } from './modal'

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

export function ConfirmDialog({ isOpen, message, onCancel, variant, ...props }: ConfirmDialogProps) {
  return (
    <ConfirmModal
      {...props}
      open={isOpen}
      onClose={onCancel}
      description={message}
      variant={variant === 'danger' ? 'danger' : 'default'}
    />
  )
}
