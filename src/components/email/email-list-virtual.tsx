'use client'

import { useRef, memo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Star, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Email } from '@/types'

interface Props {
  emails: Email[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStar?: (id: string, currentStarred: boolean) => void
  onCategoryClick?: (category: string) => void
  onLoadMore?: () => void
  hasMore?: boolean
  isFetchingMore?: boolean
}

// Memoized email row component for performance
const EmailRow = memo(function EmailRow({
  email,
  isSelected,
  onSelect,
  onStar,
  onCategoryClick,
}: {
  email: Email
  isSelected: boolean
  onSelect: () => void
  onStar?: (starred: boolean) => void
  onCategoryClick?: (category: string) => void
}) {
  const formatTime = (date: string | null) => {
    if (!date) return ''
    const d = new Date(date)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Hôm qua'
    } else if (diffDays < 7) {
      return `${diffDays} ngày`
    }
    return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
  }

  const getCategoryStyle = (category: string | null) => {
    if (!category) return null
    const styles: Record<string, { bg: string; text: string }> = {
      work: { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-[var(--foreground)] font-semibold' },
      personal: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-[var(--foreground)] font-semibold' },
      transaction: { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-[var(--foreground)] font-semibold' },
      newsletter: { bg: 'bg-gray-100 dark:bg-gray-800/60', text: 'text-[var(--foreground)] font-semibold' },
      uncategorized: { bg: 'bg-gray-100 dark:bg-gray-800/40', text: 'text-[var(--foreground)] font-semibold' },
      promotion: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-[var(--foreground)] font-semibold' },
      social: { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-[var(--foreground)] font-semibold' },
      spam: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-[var(--foreground)] font-semibold' },
    }
    return styles[category] || styles.newsletter
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return ''
    const labels: Record<string, string> = {
      work: 'Công việc',
      personal: 'Cá nhân',
      transaction: 'Giao dịch',
      newsletter: 'Newsletter',
      promotion: 'Khuyến mãi',
      social: 'Mạng XH',
      spam: 'Spam',
      uncategorized: 'Chưa phân loại',
    }
    return labels[category] || category
  }

  const categoryStyle = email.category ? getCategoryStyle(email.category) : null

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[var(--border)]',
        isSelected ? 'bg-[var(--secondary)]' : 'hover:bg-[var(--hover)]',
        !email.is_read && 'bg-[var(--card)]'
      )}
    >
      {/* Star button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onStar?.(email.is_starred)
        }}
        className={cn(
          'mt-0.5 flex-shrink-0 transition-colors',
          email.is_starred ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400 hover:text-amber-400'
        )}
      >
        <Star
          className="w-4 h-4"
          strokeWidth={1.5}
          fill={email.is_starred ? 'currentColor' : 'none'}
        />
      </button>

      {/* Content - clickable */}
      <div onClick={onSelect} className="flex-1 min-w-0 cursor-pointer">
        {/* Row 1: Sender + Time */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'text-[14px] truncate',
            email.is_read ? 'text-[var(--muted)] font-medium' : 'text-[var(--foreground)] font-bold'
          )}>
            {email.from_name || email.from_address?.split('@')[0]}
          </span>
          <span className="text-[12px] text-[var(--muted-foreground)] flex-shrink-0">
            {formatTime(email.received_at)}
          </span>
        </div>

        {/* Row 2: Priority + Subject */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {(email.priority || 0) >= 4 && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0" />
          )}
          <span className={cn(
            'text-[14px] truncate',
            email.is_read ? 'text-[var(--muted-foreground)] font-normal' : 'text-[var(--foreground)] font-semibold'
          )}>
            {email.subject || '(Không có tiêu đề)'}
          </span>
        </div>

        {/* Row 3: Summary preview */}
        {email.summary && (
          <p className="text-[13px] text-[var(--muted-foreground)] truncate mt-0.5">
            {email.summary}
          </p>
        )}
      </div>

      {/* Category tag */}
      {email.category && categoryStyle && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCategoryClick?.(email.category!)
          }}
          className={cn(
            'px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 transition-colors hover:opacity-80',
            categoryStyle.bg,
            categoryStyle.text
          )}
        >
          {getCategoryLabel(email.category)}
        </button>
      )}
    </div>
  )
})

export function EmailListVirtual({
  emails,
  selectedId,
  onSelect,
  onStar,
  onCategoryClick,
  onLoadMore,
  hasMore,
  isFetchingMore,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76, // Estimated row height
    overscan: 10, // Render extra items for smoother scrolling
  })

  const items = virtualizer.getVirtualItems()

  // Load more when scrolled near bottom
  const handleScroll = useCallback(() => {
    if (!parentRef.current || !hasMore || !onLoadMore || isFetchingMore) return

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    if (scrollHeight - scrollTop <= clientHeight + 300) {
      onLoadMore()
    }
  }, [hasMore, onLoadMore, isFetchingMore])

  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[14px] text-[var(--muted-foreground)]">
        Không có email
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="h-full overflow-auto"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualItem) => {
          const email = emails[virtualItem.index]
          return (
            <div
              key={email.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <EmailRow
                email={email}
                isSelected={selectedId === email.id}
                onSelect={() => onSelect(email.id)}
                onStar={(starred) => onStar?.(email.id, starred)}
                onCategoryClick={onCategoryClick}
              />
            </div>
          )
        })}
      </div>

      {/* Load more indicator */}
      {isFetchingMore && (
        <div className="py-4 text-center text-[13px] text-[var(--muted-foreground)]">
          Đang tải thêm...
        </div>
      )}

      {!hasMore && emails.length > 0 && (
        <div className="py-4 text-center text-[12px] text-[var(--muted-foreground)]">
          Đã hiển thị tất cả
        </div>
      )}
    </div>
  )
}
