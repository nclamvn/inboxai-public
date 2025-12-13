'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Reply, ReplyAll, Forward, Archive, Trash2,
  Mail, MailOpen, Star, StarOff, Ban, AlertTriangle,
  Sparkles, FileText, Tag
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContextMenuItem {
  id: string
  label: string
  icon: React.ElementType
  onClick: () => void
  danger?: boolean
  divider?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  selectedCount: number
  isSingleSelect: boolean
  selectedEmail?: {
    id: string
    is_read: boolean
    is_starred: boolean
    from_address: string
  }
  onAction: (action: string, data?: Record<string, unknown>) => void
}

export function ContextMenu({
  x,
  y,
  onClose,
  selectedCount,
  isSingleSelect,
  selectedEmail,
  onAction
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  // Adjust position if menu goes off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let newX = x
      let newY = y

      if (x + rect.width > viewportWidth - 20) {
        newX = viewportWidth - rect.width - 20
      }
      if (y + rect.height > viewportHeight - 20) {
        newY = viewportHeight - rect.height - 20
      }

      setPosition({ x: newX, y: newY })
    }
  }, [x, y])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  const menuItems: ContextMenuItem[] = [
    // Reply actions (only for single select)
    ...(isSingleSelect ? [
      { id: 'reply', label: 'Trả lời', icon: Reply, onClick: () => onAction('reply') },
      { id: 'reply-all', label: 'Trả lời tất cả', icon: ReplyAll, onClick: () => onAction('reply-all') },
      { id: 'forward', label: 'Chuyển tiếp', icon: Forward, onClick: () => onAction('forward'), divider: true },
    ] : []),

    // Archive & Delete
    { id: 'archive', label: 'Lưu trữ', icon: Archive, onClick: () => onAction('archive') },
    { id: 'delete', label: 'Xóa', icon: Trash2, onClick: () => onAction('delete'), danger: true, divider: true },

    // Read status
    {
      id: 'mark-read',
      label: selectedEmail?.is_read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc',
      icon: selectedEmail?.is_read ? Mail : MailOpen,
      onClick: () => onAction(selectedEmail?.is_read ? 'mark-unread' : 'mark-read')
    },

    // Star
    {
      id: 'star',
      label: selectedEmail?.is_starred ? 'Bỏ gắn sao' : 'Gắn sao',
      icon: selectedEmail?.is_starred ? StarOff : Star,
      onClick: () => onAction(selectedEmail?.is_starred ? 'unstar' : 'star'),
      divider: true
    },

    // Spam & Block
    { id: 'spam', label: 'Đánh dấu spam', icon: AlertTriangle, onClick: () => onAction('mark-spam') },
    {
      id: 'block',
      label: 'Chặn người gửi',
      icon: Ban,
      onClick: () => onAction('block-sender'),
      danger: true,
      divider: true
    },

    // AI Actions
    { id: 'reclassify', label: 'Phân loại lại (AI)', icon: Sparkles, onClick: () => onAction('reclassify') },
    ...(isSingleSelect ? [
      { id: 'summarize', label: 'Tạo tóm tắt (AI)', icon: FileText, onClick: () => onAction('summarize') },
    ] : []),

    // Category
    { id: 'change-category', label: 'Thay đổi nhãn...', icon: Tag, onClick: () => onAction('change-category'), divider: true },
  ]

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[220px] py-1',
        'bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: position.x, top: position.y }}
    >
      {/* Header showing selection count */}
      {selectedCount > 1 && (
        <div className="px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] border-b border-[var(--border)] mb-1">
          {selectedCount} email được chọn
        </div>
      )}

      {menuItems.map((item) => (
        <div key={item.id}>
          <button
            onClick={() => {
              item.onClick()
              onClose()
            }}
            disabled={item.disabled}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 text-sm text-left',
              'transition-colors',
              item.danger
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-[var(--foreground)] hover:bg-[var(--secondary)]',
              item.disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
          {item.divider && <div className="my-1 border-t border-[var(--border)]" />}
        </div>
      ))}
    </div>
  )
}
