'use client'

import { useState, useEffect, useRef, useCallback, useMemo, MouseEvent, TouchEvent } from 'react'
import { Star, ListTodo, Inbox, Newspaper, ChevronDown, ChevronRight, Loader2, Paperclip, Check, X, Archive, Trash2, Mail, MailOpen, Info, CircleAlert, Flag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSelection } from '@/contexts/email-selection-context'
import { ContextMenu } from './context-menu'
import { CategoryPicker } from './category-picker'
import { getMailCategoryLabel, MailCategoryLabel } from './mail-category-label'
import { MailSignal, mailSignal } from './mail-signal'
import type { Email } from '@/types'
import { inboxBandLabels, type InboxRanking } from '@/lib/action-inbox/rank'

interface Props {
  emails: Email[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStar?: (id: string) => void
  onCategoryClick?: (category: string) => void
  onEditCategory?: (email: Email) => void
  compact?: boolean
  groupByPriority?: boolean
  rankings?: ReadonlyMap<string, InboxRanking>
  onExplainPriority?: (email: Email) => void
  hasMore?: boolean
  loadingMore?: boolean
  pageError?: boolean
  onLoadMore?: () => void
  onBulkAction?: (action: string, emailIds: string[], data?: Record<string, unknown>) => void
  selectionEnabled?: boolean
}

interface EmailSection {
  id: 'action' | 'primary' | 'later'
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  emails: Email[]
}

// Long press duration in milliseconds
const LONG_PRESS_DURATION = 500

export function EmailListCompact({
  emails,
  selectedId,
  onSelect,
  onStar,
  onCategoryClick,
  onEditCategory,
  compact = false,
  groupByPriority = false,
  rankings,
  onExplainPriority,
  hasMore = false,
  loadingMore = false,
  pageError = false,
  onLoadMore,
  onBulkAction,
  selectionEnabled = true
}: Props) {
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<EmailSection['id'], boolean>>>({})
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Selection state - always call hook to follow rules of hooks
  const selectionHook = useSelection()
  const { selectedIds, isSelecting, toggleSelect, isSelected, clearSelection, selectAll, setIsSelecting } = selectionEnabled
    ? selectionHook
    : {
        selectedIds: new Set<string>(),
        isSelecting: false,
        toggleSelect: () => {},
        isSelected: () => false,
        clearSelection: () => {},
        selectAll: () => {},
        setIsSelecting: () => {}
      }

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    email: Email
  } | null>(null)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)

  // Long press state
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const longPressTriggered = useRef(false)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  const emailIds = emails.map(e => e.id)

  // Cleanup long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // Handle touch start - begin long press detection
  const handleTouchStart = useCallback((e: TouchEvent, email: Email) => {
    longPressTriggered.current = false
    touchStartPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    }

    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true

      // Vibrate feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }

      // Enter selection mode and select this email
      if (setIsSelecting) {
        setIsSelecting(true)
      }
      if (!isSelected(email.id)) {
        toggleSelect(email.id)
      }
    }, LONG_PRESS_DURATION)
  }, [isSelected, toggleSelect, setIsSelecting])

  // Handle touch move - cancel long press if moved too much
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartPos.current) return

    const moveThreshold = 10 // pixels
    const deltaX = Math.abs(e.touches[0].clientX - touchStartPos.current.x)
    const deltaY = Math.abs(e.touches[0].clientY - touchStartPos.current.y)

    if (deltaX > moveThreshold || deltaY > moveThreshold) {
      clearLongPressTimer()
    }
  }, [clearLongPressTimer])

  // Handle touch end - cleanup
  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer()
    touchStartPos.current = null
  }, [clearLongPressTimer])

  // Handle tap/click - only fires if not long press
  const handleTap = useCallback((email: Email, e?: MouseEvent) => {
    // Prevent click from firing after long press
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      e?.preventDefault()
      e?.stopPropagation()
      return
    }

    if (isSelecting) {
      toggleSelect(email.id)
    } else {
      onSelect(email.id)
    }
  }, [isSelecting, toggleSelect, onSelect])

  // Exit selection mode
  const exitSelectionMode = useCallback(() => {
    clearSelection()
    if (setIsSelecting) {
      setIsSelecting(false)
    }
  }, [clearSelection, setIsSelecting])

  // Infinite scroll: observe the load more sentinel with PREFETCH
  // rootMargin: '400px' triggers load 400px before reaching the end
  useEffect(() => {
    if (!onLoadMore || !hasMore || pageError) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore()
        }
      },
      {
        threshold: 0,
        rootMargin: '400px', // Start loading 400px before reaching end (approx 5-6 emails)
      }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore, pageError])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearLongPressTimer()
  }, [clearLongPressTimer])

  // Memoized helper functions
  const formatTime = useCallback((date: string | null) => {
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
  }, [])

  const sections = useMemo<EmailSection[]>(() => {
    if (!groupByPriority || !rankings) return []
    const grouped = {
      action: [] as Email[],
      primary: [] as Email[],
      later: [] as Email[],
    }
    for (const email of emails) grouped[rankings.get(email.id)?.band ?? 'primary'].push(email)
    const result: EmailSection[] = [
      { id: 'action', title: inboxBandLabels.action, icon: ListTodo, emails: grouped.action },
      { id: 'primary', title: inboxBandLabels.primary, icon: Inbox, emails: grouped.primary },
      { id: 'later', title: inboxBandLabels.later, icon: Newspaper, emails: grouped.later },
    ]
    return result.filter(section => section.emails.length > 0)
  }, [emails, groupByPriority, rankings])


  // Handle checkbox click (desktop) - memoized
  const handleCheckboxClick = useCallback((e: MouseEvent, email: Email) => {
    e.stopPropagation()

    if (e.shiftKey && lastClickedId) {
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
  }, [lastClickedId, emailIds, isSelected, toggleSelect])

  // Handle right-click context menu (desktop only) - memoized
  // On mobile, we use long press instead
  const handleContextMenu = useCallback((e: MouseEvent, email: Email) => {
    e.preventDefault()
    e.stopPropagation()

    // Skip on mobile - long press handles selection
    if ('ontouchstart' in window) {
      return
    }

    if (!isSelected(email.id)) {
      clearSelection()
      toggleSelect(email.id)
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      email
    })
  }, [isSelected, clearSelection, toggleSelect])

  // Handle context menu action
  const handleAction = useCallback((action: string, data?: Record<string, unknown>) => {
    const ids = Array.from(selectedIds)

    if (action === 'change-category') {
      if (ids.length === 1 && contextMenu?.email.id === ids[0] && onEditCategory) {
        onEditCategory(contextMenu.email)
        clearSelection()
        setContextMenu(null)
        return
      }
      setShowCategoryPicker(true)
      return
    }

    onBulkAction?.(action, ids, data)

    if (['archive', 'delete', 'mark-spam', 'block-sender'].includes(action)) {
      clearSelection()
      if (setIsSelecting) setIsSelecting(false)
    }

    setContextMenu(null)
  }, [selectedIds, contextMenu, onEditCategory, onBulkAction, clearSelection, setIsSelecting])

  // Handle category change from picker - memoized
  const handleCategoryChange = useCallback((category: string) => {
    const ids = Array.from(selectedIds)
    onBulkAction?.('change-category', ids, { category })
    setShowCategoryPicker(false)
    clearSelection()
    if (setIsSelecting) setIsSelecting(false)
  }, [selectedIds, onBulkAction, clearSelection, setIsSelecting])

  // Mobile Selection Toolbar Component
  const renderMobileSelectionToolbar = () => {
    if (!isSelecting || selectedIds.size === 0) return null

    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[var(--surface)] border-t border-[var(--border)] safe-area-bottom">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Cancel + Count */}
          <div className="flex items-center gap-3">
            <button
              onClick={exitSelectionMode}
              aria-label="Thoát chế độ chọn thư"
              className="p-2 -m-2 text-gray-600 dark:text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {selectedIds.size} đã chọn
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleAction('mark-read')}
              className="p-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Đánh dấu đã đọc"
            >
              <MailOpen className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleAction('mark-unread')}
              className="p-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Đánh dấu chưa đọc"
            >
              <Mail className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleAction('archive')}
              className="p-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Lưu trữ"
            >
              <Archive className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleAction('delete')}
              className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
              title="Xóa"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Select All bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--canvas)] border-t border-[var(--border)]">
          <button
            onClick={() => selectAll(emailIds)}
            className="text-sm text-[var(--accent-foreground)] font-semibold"
          >
            Chọn tất cả ({emails.length})
          </button>
          <button
            onClick={clearSelection}
            className="text-sm text-gray-700 dark:text-gray-400 font-medium"
          >
            Bỏ chọn
          </button>
        </div>
      </div>
    )
  }

  const renderEmailItem = (email: Email) => {
    const selected = isSelected(email.id)
    const open = selectedId === email.id && !isSelecting
    const subject = email.subject || '(Không có tiêu đề)'
    const sender = email.from_name || email.from_address || 'Người gửi'
    const category = email.category
    const categoryLabel = getMailCategoryLabel(category)
    const hasCategoryFilter = !compact && !!onCategoryClick
    const rank = rankings?.get(email.id)
    const reason = rank?.band === 'action' ? rank.reasons[0] : undefined
    const priority = reason?.signal === 'alert' ? 'urgent' : reason ? 'important' : undefined
    const priorityLabel = priority === 'urgent' ? 'Khẩn' : priority ? 'Quan trọng' : undefined

    return (
      <div
        key={email.id}
        data-active={open || selected}
        data-mail-tone={mailSignal(category, priority).tone}
        className={cn(
          'neo-mail-row group flex items-start gap-2 hover:bg-[var(--hover)]',
          compact ? 'px-3 py-2' : 'px-4 py-3'
        )}
        onContextMenu={event => handleContextMenu(event, email)}
        onTouchStart={event => handleTouchStart(event, email)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {selectionEnabled && (
          <button
            type="button"
            aria-label={`Chọn thư: ${subject}`}
            aria-pressed={selected}
            className={cn('neo-icon-button h-8 w-8', isSelecting ? 'inline-flex' : 'hidden md:inline-flex')}
            onClick={event => handleCheckboxClick(event, email)}
          >
            <span className={cn(
              'flex size-4 items-center justify-center rounded-xs border border-[var(--border-strong)]',
              selected && 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
            )}>
              {selected && <Check size={12} strokeWidth={2} aria-hidden="true" />}
            </span>
          </button>
        )}
        {onStar && (
          <button
            type="button" aria-label={`Gắn sao: ${subject}`} aria-pressed={email.is_starred}
            onClick={() => onStar(email.id)}
            className={cn('neo-icon-button hidden h-8 w-8 md:inline-flex', email.is_starred && 'text-[var(--warning)]')}
          >
            <Star size={16} strokeWidth={1.5} fill={email.is_starred ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          data-email-opener={email.id}
          onClick={event => handleTap(email, event)}
          aria-current={open ? 'true' : undefined}
          aria-label={[`${isSelecting ? 'Chọn' : 'Mở'} thư: ${subject}`, sender, !email.is_read && 'chưa đọc', priorityLabel, categoryLabel].filter(Boolean).join(', ')}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-2 text-start focus-visible:outline-none"
        >
          {!isSelecting && <MailSignal category={category} priority={priority} />}
          <span className="flex min-w-0 flex-1 flex-col items-stretch gap-1">
          <span className="flex items-center justify-between gap-2">
            <span className={cn('truncate text-sm leading-5', email.is_read ? 'font-medium text-[var(--foreground-secondary)]' : 'font-semibold')}>
              {sender}
            </span>
            <span className="shrink-0 text-xs leading-5 tabular-nums text-[var(--foreground-muted)]">{formatTime(email.received_at)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 text-sm leading-5">
            {!email.is_read && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--selection-line)]" />}
            <span className={cn('truncate', !email.is_read && 'font-semibold')}>{subject}</span>
            {email.snoozed_until && <Badge size="xs" variant="warning" className="shrink-0 px-1.5 py-0 leading-4">Đến hẹn</Badge>}
            {(email.attachment_count || 0) > 0 && <Paperclip size={14} className="shrink-0 text-[var(--foreground-muted)]" aria-label="Có tệp đính kèm" />}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            {priorityLabel && <span className="neo-mail-label" data-priority={priority}>
              {priority === 'urgent' ? <CircleAlert size={12} aria-hidden="true" /> : <Flag size={12} aria-hidden="true" />}{priorityLabel}</span>}
            {categoryLabel && (
              <span className={hasCategoryFilter ? 'lg:hidden' : undefined}>
                <MailCategoryLabel category={category} />
              </span>
            )}
            <span className={cn('min-w-0 basis-20 flex-1 truncate text-xs leading-4',
              reason ? 'font-medium text-[var(--accent-foreground)]' : 'text-[var(--foreground-muted)]')}>
              {reason?.label || (email.body_text || email.snippet || '').replace(/\s+/g, ' ').slice(0, 120)}
            </span>
          </span>
          </span>
        </button>

        {rank && onExplainPriority && !isSelecting && (
          <button
            type="button" aria-label={`Ưu tiên và nguồn: ${subject}`} title="Ưu tiên và nguồn"
            className="neo-icon-button h-8 w-8" onClick={() => onExplainPriority(email)}
          >
            <Info size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}

        {hasCategoryFilter && category && categoryLabel && onCategoryClick && (
          <button
            type="button" onClick={() => onCategoryClick(category)}
            aria-label={`Lọc danh mục ${categoryLabel}`}
            className="hidden h-8 shrink-0 items-center justify-end rounded-[var(--radius-control)] px-2 hover:bg-[var(--secondary)] lg:inline-flex"
          >
            <MailCategoryLabel category={category} />
          </button>
        )}
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

  const renderLoadMoreIndicator = () => (
    <div ref={loadMoreRef} className="py-4 flex justify-center">
      {loadingMore ? (
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          <span className="text-[13px]">Đang tải...</span>
        </div>
      ) : hasMore ? (
        <div className="text-center">
          {pageError && <p role="status" className="text-sm text-[var(--error)]">Chưa tải được trang tiếp theo.</p>}
          <button type="button" onClick={onLoadMore} className="neo-target px-3 py-2 text-sm text-[var(--accent-foreground)] underline">
            {pageError ? 'Thử tải thêm' : 'Tải thêm'}
          </button>
        </div>
      ) : emails.length > 0 ? (
        <span className="text-[12px] text-[var(--muted-foreground)]">Đã hiển thị tất cả</span>
      ) : null}
    </div>
  )

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

  if (groupByPriority) {
    return (
      <>
        <div className={cn(isSelecting && 'pb-32 md:pb-0')}>
          {sections.map((section) => {
            const Icon = section.icon
            const isCollapsed = collapsedSections[section.id] ??
              (section.id === 'later' && !section.emails.some(email => email.id === selectedId))

            return (
              <div key={section.id}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  data-mail-tone={section.id === 'action' ? 'important' : section.id === 'later' ? 'newsletter' : 'work'}
                  onClick={() => setCollapsedSections(previous => ({ ...previous, [section.id]: !isCollapsed }))}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-start hover:bg-[var(--hover)]',
                    'neo-inbox-section bg-[var(--surface)]',
                  )}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                  )}
                  <span className="neo-signal-heading" aria-hidden="true"><Icon className="size-4" strokeWidth={1.8} /></span>
                  <span className={cn(
                    'text-[13px]',
                    section.id === 'action' ? 'font-semibold text-[var(--accent-foreground)]' : 'font-medium text-[var(--foreground)]'
                  )}>
                    {section.title}
                  </span>
                  <span className="neo-signal-count text-xs tabular-nums">
                    ({section.emails.length})
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-[var(--border)]">
                    {section.emails.map(renderEmailItem)}
                  </div>
                )}
              </div>
            )
          })}
          {onLoadMore && renderLoadMoreIndicator()}
        </div>
        {renderMobileSelectionToolbar()}
        {ContextMenuPortal}
        {CategoryPickerPortal}
      </>
    )
  }

  return (
    <>
      <div className={cn(isSelecting && 'pb-32 md:pb-0')}>
        <div className="divide-y divide-[var(--border)]">
          {emails.map(renderEmailItem)}
        </div>
        {onLoadMore && renderLoadMoreIndicator()}
      </div>
      {renderMobileSelectionToolbar()}
      {ContextMenuPortal}
      {CategoryPickerPortal}
    </>
  )
}
