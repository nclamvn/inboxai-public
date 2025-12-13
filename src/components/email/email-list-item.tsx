'use client'

import { Star, Paperclip } from 'lucide-react'
import { cn, formatDate, truncate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface EmailListItemProps {
  id: string
  fromName: string
  fromAddress: string
  subject: string
  snippet: string
  receivedAt: string
  isRead: boolean
  isStarred: boolean
  priority?: number
  category?: string
  hasAttachments?: boolean
  onClick?: () => void
  onStar?: () => void
}

const priorityColors: Record<number, string> = {
  1: 'bg-red-600',
  2: 'bg-amber-600',
  3: 'bg-[var(--foreground)]',
  4: 'bg-[var(--muted)]',
  5: 'bg-[var(--border)]',
}

const categoryLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'urgent' | 'info' }> = {
  work: { label: 'Công việc', variant: 'info' },
  personal: { label: 'Cá nhân', variant: 'success' },
  newsletter: { label: 'Bản tin', variant: 'default' },
  promotion: { label: 'Khuyến mãi', variant: 'warning' },
  transaction: { label: 'Giao dịch', variant: 'urgent' },
  social: { label: 'Mạng xã hội', variant: 'secondary' },
}

export function EmailListItem({
  id,
  fromName,
  fromAddress,
  subject,
  snippet,
  receivedAt,
  isRead,
  isStarred,
  priority = 3,
  category,
  hasAttachments,
  onClick,
  onStar,
}: EmailListItemProps) {
  const categoryInfo = category ? categoryLabels[category] : null

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-4 border-b border-[var(--border)] cursor-pointer transition-colors',
        isRead ? 'bg-[var(--card)]' : 'bg-[var(--secondary)]',
        'hover:bg-[var(--hover)]'
      )}
    >
      {/* Priority Indicator */}
      <div className={cn('w-1 h-12 rounded-full flex-shrink-0', priorityColors[priority])} />

      {/* Star */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onStar?.()
        }}
        className="flex-shrink-0 mt-0.5"
      >
        <Star
          className={cn(
            'w-5 h-5 transition-colors',
            isStarred ? 'fill-amber-500 text-amber-500' : 'text-[var(--muted)] hover:text-amber-500'
          )}
          strokeWidth={1.5}
        />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('text-[14px] truncate', isRead ? 'text-[var(--muted-foreground)]' : 'font-semibold text-[var(--foreground)]')}>
            {fromName || fromAddress}
          </span>
          {categoryInfo && (
            <Badge variant={categoryInfo.variant} size="sm">
              {categoryInfo.label}
            </Badge>
          )}
          {hasAttachments && <Paperclip className="w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0" strokeWidth={1.5} />}
        </div>
        <p className={cn('text-[14px] truncate mb-1', isRead ? 'text-[var(--muted-foreground)]' : 'font-medium text-[var(--foreground)]')}>
          {subject || '(Không có tiêu đề)'}
        </p>
        <p className="text-[13px] text-[var(--muted)] truncate">{truncate(snippet, 80)}</p>
      </div>

      {/* Time */}
      <span className="text-[12px] text-[var(--muted)] flex-shrink-0 mt-0.5">
        {formatDate(receivedAt)}
      </span>
    </div>
  )
}
