'use client'

import { useState, useEffect, useRef, useCallback, MouseEvent } from 'react'
import { Star, Zap, Inbox, Newspaper, ChevronDown, ChevronRight, Loader2, Paperclip, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSelection } from '@/contexts/email-selection-context'
import { ContextMenu } from './context-menu'
import { CategoryPicker } from './category-picker'
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
  onBulkAction?: (action: string, emailIds: string[], data?: Record<string, unknown>) => void
  selectionEnabled?: boolean
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
  onLoadMore,
  onBulkAction,
  selectionEnabled = true
}: Props) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    readLater: true // Collapsed by default
  })
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Selection state
  const selection = selectionEnabled ? useSelection() : null
  const { selectedIds, isSelecting, toggleSelect, isSelected, clearSelection, selectAll } = selection || {
    selectedIds: new Set<string>(),
    isSelecting: false,
    toggleSelect: () => {},
    isSelected: () => false,
    clearSelection: () => {},
    selectAll: () => {}
  }

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    email: Email
  } | null>(null)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)

  const emailIds = emails.map(e => e.id)

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
    // Option B: Light background + extra dark text with font-semibold for high contrast
    const styles: Record<string, { bg: string; text: string; hoverBg: string }> = {
      work: {
        bg: 'bg-blue-50 dark:bg-blue-900/40',
        text: 'text-blue-900 dark:text-blue-200 font-semibold',
        hoverBg: 'hover:bg-blue-100 dark:hover:bg-blue-900/60'
      },
      personal: {
        bg: 'bg-purple-50 dark:bg-purple-900/40',
        text: 'text-purple-900 dark:text-purple-200 font-semibold',
        hoverBg: 'hover:bg-purple-100 dark:hover:bg-purple-900/60'
      },
      transaction: {
        bg: 'bg-emerald-50 dark:bg-emerald-900/40',
        text: 'text-emerald-900 dark:text-emerald-200 font-semibold',
        hoverBg: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
      },
      newsletter: {
        bg: 'bg-gray-100 dark:bg-gray-800/60',
        text: 'text-gray-900 dark:text-gray-200 font-semibold',
        hoverBg: 'hover:bg-gray-200 dark:hover:bg-gray-800/80'
      },
      promotion: {
        bg: 'bg-orange-50 dark:bg-orange-900/40',
        text: 'text-orange-900 dark:text-orange-200 font-semibold',
        hoverBg: 'hover:bg-orange-100 dark:hover:bg-orange-900/60'
      },
      social: {
        bg: 'bg-cyan-50 dark:bg-cyan-900/40',
        text: 'text-cyan-900 dark:text-cyan-200 font-semibold',
        hoverBg: 'hover:bg-cyan-100 dark:hover:bg-cyan-900/60'
      },
      spam: {
        bg: 'bg-red-50 dark:bg-red-900/40',
        text: 'text-red-900 dark:text-red-200 font-semibold',
        hoverBg: 'hover:bg-red-100 dark:hover:bg-red-900/60'
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

  // Handle checkbox click
  const handleCheckboxClick = (e: MouseEvent, email: Email) => {
    e.stopPropagation()

    if (e.shiftKey && lastClickedId) {
      // Shift+click: select range
      const fromIndex = emailIds.indexOf(lastClickedId)
      const toIndex = emailIds.indexOf(email.id)
      if (fromIndex !== -1 && toIndex !== -1) {
        const start = Math.min(fromIndex, toIndex)
        const end = Math.max(fromIndex, toIndex)
        const rangeIds = emailIds.slice(start, end + 1)
        rangeIds.forEach(id => {
          if (!isSelected(id)) toggleSelect(id)
        })
      }
    } else {
      toggleSelect(email.id)
    }

    setLastClickedId(email.id)
  }

  // Handle right-click context menu
  const handleContextMenu = (e: MouseEvent, email: Email) => {
    e.preventDefault()

    // If right-clicking on unselected email, select only that one
    if (!isSelected(email.id)) {
      clearSelection()
      toggleSelect(email.id)
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      email
    })
  }

  // Handle context menu action
  const handleAction = useCallback((action: string, data?: Record<string, unknown>) => {
    const ids = Array.from(selectedIds)

    if (action === 'change-category') {
      setShowCategoryPicker(true)
      return
    }

    onBulkAction?.(action, ids, data)

    // Clear selection after destructive actions
    if (['archive', 'delete', 'mark-spam', 'block-sender'].includes(action)) {
      clearSelection()
    }

    setContextMenu(null)
  }, [selectedIds, onBulkAction, clearSelection])

  // Handle category change from picker
  const handleCategoryChange = (category: string) => {
    const ids = Array.from(selectedIds)
    onBulkAction?.('change-category', ids, { category })
    setShowCategoryPicker(false)
    clearSelection()
  }

  const renderEmailItem = (email: Email) => {
    const categoryStyle = email.category ? getCategoryStyle(email.category) : null
    const emailIsSelected = isSelected(email.id)

    return (
      <div
        key={email.id}
        onClick={() => {
          if (!isSelecting) {
            onSelect(email.id)
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, email)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (!isSelecting) onSelect(email.id)
          }
        }}
        className={cn(
          'w-full transition-colors cursor-pointer group',
          compact ? 'px-3 py-2.5' : 'px-4 py-3',
          selectedId === email.id
            ? 'bg-[var(--secondary)]'
            : emailIsSelected
              ? 'bg-[var(--primary)]/5'
              : 'hover:bg-[var(--hover)] active:bg-[var(--secondary)]',
          !email.is_read && !emailIsSelected && 'bg-blue-50/30 dark:bg-blue-900/10'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox - visible on hover or when selecting */}
          <button
            onClick={(e) => handleCheckboxClick(e, email)}
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all hidden md:flex',
              emailIsSelected
                ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                : 'border-[var(--border)] hover:border-[var(--primary)]',
              !isSelecting && !emailIsSelected && 'opacity-0 group-hover:opacity-100'
            )}
          >
            {emailIsSelected && <Check className="w-3 h-3" strokeWidth={2.5} />}
          </button>

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

  // Context menu and category picker components
  const ContextMenuPortal = contextMenu && (
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      onClose={() => setContextMenu(null)}
      selectedCount={selectedIds.size}
      isSingleSelect={selectedIds.size === 1}
      selectedEmail={{
        id: contextMenu.email.id,
        is_read: contextMenu.email.is_read,
        is_starred: contextMenu.email.is_starred,
        from_address: contextMenu.email.from_address
      }}
      onAction={handleAction}
    />
  )

  const CategoryPickerPortal = showCategoryPicker && (
    <CategoryPicker
      onSelect={handleCategoryChange}
      onClose={() => setShowCategoryPicker(false)}
      currentCategory={contextMenu?.email?.category || undefined}
    />
  )

  // Smart sort mode: render with sections
  if (smartSort) {
    const sections = groupEmailsIntoSections(emails)

    return (
      <>
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
        {ContextMenuPortal}
        {CategoryPickerPortal}
      </>
    )
  }

  // Default mode: flat list
  return (
    <>
      <div>
        <div className="divide-y divide-[var(--border)]">
          {emails.map(renderEmailItem)}
        </div>
        {onLoadMore && <LoadMoreIndicator />}
      </div>
      {ContextMenuPortal}
      {CategoryPickerPortal}
    </>
  )
}
