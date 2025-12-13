'use client'

import { useSelection } from '@/contexts/email-selection-context'
import {
  Archive, Trash2, Mail, MailOpen, Star,
  AlertTriangle, Sparkles, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectionToolbarProps {
  onAction: (action: string, emailIds: string[]) => void
}

export function SelectionToolbar({ onAction }: SelectionToolbarProps) {
  const { selectedIds, clearSelection, isSelecting } = useSelection()

  if (!isSelecting) return null

  const ids = Array.from(selectedIds)

  const actions = [
    { id: 'archive', icon: Archive, label: 'Lưu trữ' },
    { id: 'delete', icon: Trash2, label: 'Xóa', danger: true },
    { id: 'mark-read', icon: MailOpen, label: 'Đã đọc' },
    { id: 'mark-unread', icon: Mail, label: 'Chưa đọc' },
    { id: 'star', icon: Star, label: 'Gắn sao' },
    { id: 'mark-spam', icon: AlertTriangle, label: 'Spam' },
    { id: 'reclassify', icon: Sparkles, label: 'AI phân loại' },
  ]

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border-b border-[var(--border)]">
      {/* Selection count */}
      <div className="flex items-center gap-2 mr-2">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {selectedIds.size} được chọn
        </span>
        <button
          onClick={clearSelection}
          className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-6 w-px bg-[var(--border)]" />

      {/* Action buttons */}
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={() => onAction(action.id, ids)}
          className={cn(
            'p-2 rounded-lg transition-colors',
            action.danger
              ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]'
          )}
          title={action.label}
        >
          <action.icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  )
}
