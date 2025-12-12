'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Star, Zap, Inbox, Newspaper, ChevronDown, ChevronRight, Loader2, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Email } from '@/types'

interface Props {
  emails: Email[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStar?: (id: string) => void
  onCategoryClick?: (category: string) => void
  compact?: boolean
  smartSort?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

interface EmailSection {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  emails: Email[]
  defaultCollapsed?: boolean
}

export function EmailListCompact({
  emails,
  selectedId,
  onSelect,
  onStar,
  onCategoryClick,
  compact = false,
  smartSort = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore
}: Props) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    readLater: true // Collapsed by default
  })
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Infinite scroll: observe the load more sentinel
  useEffect(() => {
    if (!onLoadMore || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

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
    } else {
      return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
    }
  }

  const getCategoryStyle = (category: string | null) => {
    if (!category) return null
    const styles: Record<string, { bg: string; text: string; hoverBg: string }> = {
      work: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-600 dark:text-blue-400',
        hoverBg: 'hover:bg-blue-200 dark:hover:bg-blue-900/50'
      },
      personal: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-600 dark:text-green-400',
        hoverBg: 'hover:bg-green-200 dark:hover:bg-green-900/50'
      },
      transaction: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-600 dark:text-red-400',
        hoverBg: 'hover:bg-red-200 dark:hover:bg-red-900/50'
      },
      newsletter: {
        bg: 'bg-[var(--secondary)]',
        text: 'text-[var(--muted)]',
        hoverBg: 'hover:bg-[var(--hover)]'
      },
      promotion: {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-600 dark:text-amber-400',
        hoverBg: 'hover:bg-amber-200 dark:hover:bg-amber-900/50'
      },
      social: {
        bg: 'bg-violet-100 dark:bg-violet-900/30',
        text: 'text-violet-600 dark:text-violet-400',
        hoverBg: 'hover:bg-violet-200 dark:hover:bg-violet-900/50'
      },
      spam: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-600 dark:text-red-400',
        hoverBg: 'hover:bg-red-200 dark:hover:bg-red-900/50'
      },
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
    }
    return labels[category] || category
  }

  // Group emails into sections for smart sort
  const groupEmailsIntoSections = (emails: Email[]): EmailSection[] => {
    const needsAction: Email[] = []
    const primary: Email[] = []
    const readLater: Email[] = []

    emails.forEach(email => {
      // Tier 1: Needs Action - unread + (high priority OR needs_reply OR has deadline)
      if (!email.is_read && (
        (email.priority || 0) >= 4 ||
        email.needs_reply ||
        email.detected_deadline
      )) {
        needsAction.push(email)
      }
      // Tier 3: Read Later - newsletter or promotion
      else if (email.category === 'newsletter' || email.category === 'promotion') {
        readLater.push(email)
      }
      // Tier 2: Primary - everything else
      else {
        primary.push(email)
      }
    })

    return [
      {
        id: 'needsAction',
        title: 'Cần xử lý',
        icon: Zap,
        emails: needsAction
      },
      {
        id: 'primary',
        title: 'Hộp thư chính',
        icon: Inbox,
        emails: primary
      },
      {
        id: 'readLater',
        title: 'Đọc sau',
        icon: Newspaper,
        emails: readLater,
        defaultCollapsed: true
      }
    ].filter(section => section.emails.length > 0)
  }

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  const renderEmailItem = (email: Email) => {
    const categoryStyle = email.category ? getCategoryStyle(email.category) : null

    return (
      <div
        key={email.id}
        onClick={() => onSelect(email.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelect(email.id)
          }
        }}
        className={cn(
          'w-full transition-colors cursor-pointer',
          compact ? 'px-3 py-2.5' : 'px-4 py-3',
          selectedId === email.id
            ? 'bg-[var(--secondary)]'
            : 'hover:bg-[var(--hover)] active:bg-[var(--secondary)]',
          !email.is_read && 'bg-blue-50/30 dark:bg-blue-900/10'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Avatar for mobile-like look */}
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-medium flex-shrink-0 md:hidden',
            !email.is_read ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-[var(--secondary)] text-[var(--muted)]'
          )}>
            {(email.from_name || email.from_address || 'U')[0].toUpperCase()}
          </div>

          {/* Star - desktop only */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStar?.(email.id)
            }}
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
                {email.subject || '(Không có tiêu đề)'}
              </span>
              {(email.attachment_count || 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[var(--muted-foreground)] flex-shrink-0" title={`${email.attachment_count} tệp đính kèm`}>
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
          {!email.is_read && (
            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2 md:hidden" />
          )}

          {/* Category Tag - desktop only */}
          {email.category && categoryStyle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCategoryClick?.(email.category!)
              }}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 transition-colors hidden md:block',
                categoryStyle.bg,
                categoryStyle.text,
                categoryStyle.hoverBg
              )}
              title={`Lọc theo ${getCategoryLabel(email.category)}`}
            >
              {getCategoryLabel(email.category)}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[14px] text-[var(--muted-foreground)]">
        Không có email
      </div>
    )
  }

  // Load more indicator component
  const LoadMoreIndicator = () => (
    <div ref={loadMoreRef} className="py-4 flex justify-center">
      {loadingMore ? (
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          <span className="text-[13px]">Đang tải...</span>
        </div>
      ) : hasMore ? (
        <button
          onClick={onLoadMore}
          className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          Tải thêm
        </button>
      ) : emails.length > 0 ? (
        <span className="text-[12px] text-[var(--muted-foreground)]">Đã hiển thị tất cả</span>
      ) : null}
    </div>
  )

  // Smart sort mode: render with sections
  if (smartSort) {
    const sections = groupEmailsIntoSections(emails)

    return (
      <div>
        {sections.map((section) => {
          const Icon = section.icon
          const isCollapsed = collapsedSections[section.id] ?? section.defaultCollapsed

          return (
            <div key={section.id}>
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                )}
                <Icon
                  className={cn(
                    'w-4 h-4',
                    section.id === 'needsAction' ? 'text-red-600 dark:text-red-400' : 'text-[var(--muted)]'
                  )}
                  strokeWidth={1.5}
                />
                <span className={cn(
                  'text-[13px] font-medium',
                  section.id === 'needsAction' ? 'text-red-600 dark:text-red-400' : 'text-[var(--foreground)]'
                )}>
                  {section.title}
                </span>
                <span className="text-[12px] text-[var(--muted-foreground)]">
                  ({section.emails.length})
                </span>
              </button>

              {/* Section Emails */}
              {!isCollapsed && (
                <div className="divide-y divide-[var(--border)]">
                  {section.emails.map(renderEmailItem)}
                </div>
              )}
            </div>
          )
        })}
        {onLoadMore && <LoadMoreIndicator />}
      </div>
    )
  }

  // Default mode: flat list
  return (
    <div>
      <div className="divide-y divide-[var(--border)]">
        {emails.map(renderEmailItem)}
      </div>
      {onLoadMore && <LoadMoreIndicator />}
    </div>
  )
}
