'use client'

import { memo, useCallback } from 'react'
import { Star, Check, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Email } from '@/types'

// Static data - outside component for performance
const CATEGORY_STYLES: Record<string, { bg: string; text: string; hoverBg: string }> = {
  work: {
    bg: 'bg-blue-50 dark:bg-blue-900/40',
    text: 'text-gray-900 dark:text-white font-semibold',
    hoverBg: 'hover:bg-blue-100 dark:hover:bg-blue-900/60'
  },
  personal: {
    bg: 'bg-purple-50 dark:bg-purple-900/40',
    text: 'text-gray-900 dark:text-white font-semibold',
    hoverBg: 'hover:bg-purple-100 dark:hover:bg-purple-900/60'
  },
  transaction: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/40',
    text: 'text-gray-900 dark:text-white font-semibold',
    hoverBg: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
  },
  newsletter: {
    bg: 'bg-gray-100 dark:bg-gray-800/60',
    text: 'text-gray-900 dark:text-white font-semibold',
    hoverBg: 'hover:bg-gray-200 dark:hover:bg-gray-800/80'
  },
  promotion: {
    bg: 'bg-orange-50 dark:bg-orange-900/40',
    text: 'text-gray-900 dark:text-white font-semibold',
    hoverBg: 'hover:bg-orange-100 dark:hover:bg-orange-900/60'
  },
  social: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/40',
    text: 'text-gray-900 dark:text-white font-semibold',
    hoverBg: 'hover:bg-cyan-100 dark:hover:bg-cyan-900/60'
  },
  spam: {
    bg: 'bg-red-50 dark:bg-red-900/40',
    text: 'text-gray-900 dark:text-white font-semibold',
    hoverBg: 'hover:bg-red-100 dark:hover:bg-red-900/60'
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  work: 'Cong viec',
  personal: 'Ca nhan',
  transaction: 'Giao dich',
  newsletter: 'Newsletter',
  promotion: 'Khuyen mai',
  social: 'Mang XH',
  spam: 'Spam',
}

interface EmailItemProps {
  email: Email
  isSelected: boolean
  isSelecting: boolean
  isCurrentEmail: boolean
  compact?: boolean
  onSelect: (id: string) => void
  onCheckboxClick: (e: React.MouseEvent, email: Email) => void
  onContextMenu: (e: React.MouseEvent, email: Email) => void
  onTouchStart: (e: React.TouchEvent, email: Email) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onStar?: (id: string) => void
  onCategoryClick?: (category: string) => void
  formatTime: (date: string | null) => string
}

export const EmailItem = memo(function EmailItem({
  email,
  isSelected,
  isSelecting,
  isCurrentEmail,
  compact = false,
  onSelect,
  onCheckboxClick,
  onContextMenu,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onStar,
  onCategoryClick,
  formatTime,
}: EmailItemProps) {
  const categoryStyle = email.category ? CATEGORY_STYLES[email.category] || CATEGORY_STYLES.newsletter : null
  const categoryLabel = email.category ? CATEGORY_LABELS[email.category] || email.category : ''

  const handleClick = useCallback(() => {
    if (!isSelecting) {
      onSelect(email.id)
    }
  }, [isSelecting, onSelect, email.id])

  const handleCheckbox = useCallback((e: React.MouseEvent) => {
    onCheckboxClick(e, email)
  }, [onCheckboxClick, email])

  const handleContext = useCallback((e: React.MouseEvent) => {
    onContextMenu(e, email)
  }, [onContextMenu, email])

  const handleTouchStartWrapper = useCallback((e: React.TouchEvent) => {
    onTouchStart(e, email)
  }, [onTouchStart, email])

  const handleStarClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onStar?.(email.id)
  }, [onStar, email.id])

  const handleCategoryClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onCategoryClick?.(email.category!)
  }, [onCategoryClick, email.category])

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContext}
      onTouchStart={handleTouchStartWrapper}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      role="button"
      tabIndex={0}
      className={cn(
        'w-full transition-colors cursor-pointer group select-none',
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
        isCurrentEmail && !isSelecting
          ? 'bg-[var(--secondary)]'
          : isSelected
            ? 'bg-blue-100 text-gray-900 dark:bg-blue-600/40 dark:text-white'
            : 'hover:bg-[var(--hover)] active:bg-[var(--secondary)]',
        !email.is_read && !isSelected && 'bg-blue-50/30 dark:bg-blue-900/10'
      )}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Mobile: Checkbox when selecting, Avatar when not */}
        <div className="md:hidden flex-shrink-0">
          {isSelecting ? (
            <button
              onClick={handleCheckbox}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600'
              )}
            >
              {isSelected && <Check className="w-5 h-5" strokeWidth={2.5} />}
            </button>
          ) : (
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-medium',
              !email.is_read
                ? 'bg-blue-100 dark:bg-blue-900/30 text-gray-900 dark:text-white'
                : 'bg-[var(--secondary)] text-[var(--muted)]'
            )}>
              {(email.from_name || email.from_address || 'U')[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* Desktop: Checkbox */}
        <button
          onClick={handleCheckbox}
          className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all hidden md:flex',
            isSelected
              ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
              : 'border-[var(--border)] hover:border-[var(--primary)]',
            !isSelecting && !isSelected && 'opacity-0 group-hover:opacity-100'
          )}
        >
          {isSelected && <Check className="w-3 h-3" strokeWidth={2.5} />}
        </button>

        {/* Star - desktop only */}
        <button
          onClick={handleStarClick}
          className={cn(
            'mt-0.5 flex-shrink-0 hidden md:block',
            email.is_starred ? 'text-amber-500' : 'text-[var(--border)] hover:text-[var(--muted-foreground)]'
          )}
        >
          <Star
            className="w-4 h-4"
            strokeWidth={1.5}
            fill={email.is_starred ? 'currentColor' : 'none'}
          />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Sender + Time */}
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'text-[14px] truncate',
              email.is_read ? 'text-[var(--muted)] font-medium' : 'text-[var(--foreground)] font-semibold'
            )}>
              {email.from_name || email.from_address?.split('@')[0]}
            </span>
            <span className="text-[12px] text-[var(--muted-foreground)] flex-shrink-0">
              {formatTime(email.received_at)}
            </span>
          </div>

          {/* Row 2: Priority + Subject + Attachment */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {(email.priority || 0) >= 4 && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0" />
            )}
            <span className={cn(
              'text-[14px] truncate',
              email.is_read ? 'text-[var(--muted)]' : 'text-[var(--foreground)]'
            )}>
              {email.subject || '(Khong co tieu de)'}
            </span>
            {(email.attachment_count || 0) > 0 && (
              <span className="flex items-center gap-0.5 text-[var(--muted-foreground)] flex-shrink-0">
                <Paperclip className="w-3.5 h-3.5" strokeWidth={1.5} />
                {(email.attachment_count || 0) > 1 && (
                  <span className="text-[11px]">{email.attachment_count}</span>
                )}
              </span>
            )}
          </div>

          {/* Row 3: Preview */}
          <p className="text-[13px] text-[var(--muted-foreground)] truncate mt-0.5">
            {(email.body_text || email.snippet || '')?.replace(/\\n/g, ' ').slice(0, 80)}
          </p>
        </div>

        {/* Unread indicator - mobile */}
        {!email.is_read && !isSelecting && (
          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2 md:hidden" />
        )}

        {/* Category Tag - desktop only */}
        {email.category && categoryStyle && (
          <button
            onClick={handleCategoryClick}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 transition-colors hidden md:block',
              categoryStyle.bg,
              categoryStyle.text,
              categoryStyle.hoverBg
            )}
          >
            {categoryLabel}
          </button>
        )}
      </div>
    </div>
  )
})

export default EmailItem
