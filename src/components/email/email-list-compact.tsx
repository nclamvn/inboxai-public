'use client'

import { useState, useEffect, useRef, useCallback, MouseEvent, TouchEvent } from 'react'
import { Star, Zap, Inbox, Newspaper, ChevronDown, ChevronRight, Loader2, Paperclip, Check, X, Archive, Trash2, Mail, MailOpen } from 'lucide-react'
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

// Long press duration in milliseconds
const LONG_PRESS_DURATION = 500

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
  const { selectedIds, isSelecting, toggleSelect, isSelected, clearSelection, selectAll, setIsSelecting } = selection || {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => clearLongPressTimer()
  }, [clearLongPressTimer])

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
      if (!email.is_read && (
        (email.priority || 0) >= 4 ||
        email.needs_reply ||
        email.detected_deadline
      )) {
        needsAction.push(email)
      } else if (email.category === 'newsletter' || email.category === 'promotion') {
        readLater.push(email)
      } else {
        primary.push(email)
      }
    })

    return [
      { id: 'needsAction', title: 'Cần xử lý', icon: Zap, emails: needsAction },
      { id: 'primary', title: 'Hộp thư chính', icon: Inbox, emails: primary },
      { id: 'readLater', title: 'Đọc sau', icon: Newspaper, emails: readLater, defaultCollapsed: true }
    ].filter(section => section.emails.length > 0)
  }

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  // Handle checkbox click (desktop)
  const handleCheckboxClick = (e: MouseEvent, email: Email) => {
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
  }

  // Handle right-click context menu (desktop only)
  // On mobile, we use long press instead
  const handleContextMenu = (e: MouseEvent, email: Email) => {
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
  }

  // Handle context menu action
  const handleAction = useCallback((action: string, data?: Record<string, unknown>) => {
    const ids = Array.from(selectedIds)

    if (action === 'change-category') {
      setShowCategoryPicker(true)
      return
    }

    onBulkAction?.(action, ids, data)

    if (['archive', 'delete', 'mark-spam', 'block-sender'].includes(action)) {
      clearSelection()
      if (setIsSelecting) setIsSelecting(false)
    }

    setContextMenu(null)
  }, [selectedIds, onBulkAction, clearSelection, setIsSelecting])

  // Handle category change from picker
  const handleCategoryChange = (category: string) => {
    const ids = Array.from(selectedIds)
    onBulkAction?.('change-category', ids, { category })
    setShowCategoryPicker(false)
    clearSelection()
    if (setIsSelecting) setIsSelecting(false)
  }

  // Mobile Selection Toolbar Component
  const MobileSelectionToolbar = () => {
    if (!isSelecting || selectedIds.size === 0) return null

    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg safe-area-bottom">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Cancel + Count */}
          <div className="flex items-center gap-3">
            <button
              onClick={exitSelectionMode}
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
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => selectAll(emailIds)}
            className="text-sm text-blue-600 dark:text-blue-400 font-medium"
          >
            Chọn tất cả ({emails.length})
          </button>
          <button
            onClick={clearSelection}
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            Bỏ chọn
          </button>
        </div>
      </div>
    )
  }

  const renderEmailItem = (email: Email) => {
    const categoryStyle = email.category ? getCategoryStyle(email.category) : null
    const emailIsSelected = isSelected(email.id)

    return (
      <div
        key={email.id}
        onClick={(e) => handleTap(email, e)}
        onContextMenu={(e) => handleContextMenu(e, email)}
        onTouchStart={(e) => handleTouchStart(e, email)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleTap(email, e as unknown as MouseEvent)
          }
        }}
        style={{
          touchAction: 'manipulation',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }}
        className={cn(
          'w-full transition-colors cursor-pointer group select-none',
          compact ? 'px-3 py-2.5' : 'px-4 py-3',
          selectedId === email.id && !isSelecting
            ? 'bg-[var(--secondary)]'
            : emailIsSelected
              ? 'bg-blue-100 dark:bg-blue-800/50'
              : 'hover:bg-[var(--hover)] active:bg-[var(--secondary)]',
          !email.is_read && !emailIsSelected && 'bg-blue-50/30 dark:bg-blue-900/10'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Mobile: Checkbox when selecting, Avatar when not */}
          <div className="md:hidden flex-shrink-0">
            {isSelecting ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSelect(email.id)
                }}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                  emailIsSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600'
                )}
              >
                {emailIsSelected && <Check className="w-5 h-5" strokeWidth={2.5} />}
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

          {/* Unread indicator - mobile (when not selecting) */}
          {!email.is_read && !isSelecting && (
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

  const LoadMoreIndicator = () => (
    <div ref={loadMoreRef} className="py-4 flex justify-center">
      {loadingMore ? (
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          <span className="text-[13px]">Đang tải...</span>
        </div>
      ) : hasMore ? (
        <button onClick={onLoadMore} className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)]">
          Tải thêm
        </button>
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

  if (smartSort) {
    const sections = groupEmailsIntoSections(emails)

    return (
      <>
        <div className={cn(isSelecting && 'pb-32 md:pb-0')}>
          {sections.map((section) => {
            const Icon = section.icon
            const isCollapsed = collapsedSections[section.id] ?? section.defaultCollapsed

            return (
              <div key={section.id}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] border-b border-[var(--border)] hover:bg-[var(--hover)]"
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
        <MobileSelectionToolbar />
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
        {onLoadMore && <LoadMoreIndicator />}
      </div>
      <MobileSelectionToolbar />
      {ContextMenuPortal}
      {CategoryPickerPortal}
    </>
  )
}
