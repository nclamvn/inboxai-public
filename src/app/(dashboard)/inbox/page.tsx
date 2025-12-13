'use client'

import { Suspense, useMemo, useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  RefreshCw, MoreHorizontal, Inbox,
  ChevronLeft, Maximize2, Minimize2, Loader2,
  X, Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmails } from '@/hooks/use-emails'
import { useEmail } from '@/hooks/use-email'
import { FilterChips } from '@/components/email/filter-chips'
import { EmailListCompact } from '@/components/email/email-list-compact'
import { EmailListSkeleton } from '@/components/email/email-list-skeleton'
import { EmailDetailFull } from '@/components/email/email-detail-full'
import { EmailDetailMobile } from '@/components/email/email-detail-mobile'
import { SelectionProvider } from '@/contexts/email-selection-context'
import { SelectionToolbar } from '@/components/email/selection-toolbar'

type ViewMode = 'list' | 'split' | 'full'

interface BriefingFilter {
  type: string
  title: string
  emailIds: string[]
}

function InboxContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { emails, loading, loadingMore, hasMore, toggleStar, archiveEmail, deleteEmail, markAsRead, refetch, loadMore } = useEmails({ folder: 'inbox' })

  // URL-based state - selectedId from URL
  const selectedId = searchParams.get('email')
  const briefingType = searchParams.get('briefing')

  // Local UI state only
  const [viewMode, setViewMode] = useState<ViewMode>(selectedId ? 'split' : 'list')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [briefingFilter, setBriefingFilter] = useState<BriefingFilter | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Read briefing filter from sessionStorage when URL has briefing param
  useEffect(() => {
    if (briefingType) {
      try {
        const stored = sessionStorage.getItem('briefing_filter')
        if (stored) {
          const data = JSON.parse(stored) as BriefingFilter
          if (data.type === briefingType) {
            setBriefingFilter(data)
            setActiveFilter(null) // Clear category filter when using briefing filter
          }
        }
      } catch (e) {
        console.error('Failed to parse briefing filter:', e)
      }
    } else {
      // Clear briefing filter when URL doesn't have briefing param
      setBriefingFilter(null)
      sessionStorage.removeItem('briefing_filter')
    }
  }, [briefingType])

  // ALWAYS fetch full email when selectedId is set (list only has preview, not body)
  const { email: fetchedEmail, loading: fetchingEmail } = useEmail(selectedId)

  // Update viewMode when URL changes
  const effectiveViewMode = selectedId ? (viewMode === 'list' ? 'split' : viewMode) : 'list'

  const handleClassify = async () => {
    setClassifying(true)
    try {
      const res = await fetch('/api/ai/classify-batch', {
        method: 'POST'
      })
      const data = await res.json()

      if (res.ok) {
        alert(data.message || `Đã phân loại ${data.classified}/${data.total} email`)
        refetch()
      } else {
        alert(data.error || 'Phân loại thất bại')
      }
    } catch (error) {
      console.error('Classify error:', error)
      alert('Phân loại thất bại')
    } finally {
      setClassifying(false)
    }
  }

  // Handle reclassify spam emails with AI
  const handleReclassify = useCallback(async (category: string) => {
    setReclassifying(true)
    try {
      const res = await fetch('/api/ai/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, limit: 50 })
      })
      const data = await res.json()

      if (data.success) {
        if (data.updated > 0) {
          alert(`Đã sửa ${data.updated}/${data.total} emails bị gán sai!\n\n${data.changes?.slice(0, 5).map((c: { subject: string; from: string; to: string }) => `• ${c.subject}: ${c.from} → ${c.to}`).join('\n') || ''}`)
          refetch()
        } else {
          alert(`Đã kiểm tra ${data.total} emails - không có email nào cần sửa`)
        }
      } else {
        alert(data.error || 'Lỗi khi phân loại lại')
      }
    } catch (error) {
      console.error('Reclassify error:', error)
      alert('Lỗi khi phân loại lại')
    } finally {
      setReclassifying(false)
    }
  }, [refetch])

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    const counts = {
      all: emails.length,
      work: 0,
      personal: 0,
      transaction: 0,
      newsletter: 0,
      promotion: 0,
      social: 0,
      spam: 0,
      needsAction: 0,
    }

    emails.forEach(email => {
      if (email.category) {
        const cat = email.category as keyof typeof counts
        if (cat in counts) {
          (counts as Record<string, number>)[cat]++
        }
      }

      if (!email.is_read && (
        (email.priority || 0) >= 4 ||
        email.needs_reply ||
        email.detected_deadline
      )) {
        counts.needsAction++
      }
    })

    return counts
  }, [emails])

  // Categories quan trọng cần warning
  const IMPORTANT_CATEGORIES = ['work', 'personal', 'transaction', 'needsAction']

  // Category labels
  const CATEGORY_LABELS: Record<string, string> = {
    work: 'Công việc',
    personal: 'Cá nhân',
    transaction: 'Giao dịch',
    newsletter: 'Newsletter',
    promotion: 'Khuyến mãi',
    social: 'Mạng XH',
    spam: 'Spam',
    needsAction: 'Cần xử lý'
  }

  // Handle delete all in category - với SMART WARNING
  const handleDeleteAllInCategory = useCallback(async (category: string) => {
    const count = filterCounts[category as keyof typeof filterCounts] || 0
    if (count === 0) return

    const label = CATEGORY_LABELS[category] || category
    const isImportant = IMPORTANT_CATEGORIES.includes(category)

    // Smart warning dựa trên importance
    if (isImportant) {
      // Categories quan trọng → Double confirm
      const confirmed = confirm(
        `⚠️ CẢNH BÁO: Bạn sắp xóa ${count} email "${label}"!\n\n` +
        `Đây là danh mục QUAN TRỌNG. Hành động này không thể hoàn tác.\n\n` +
        `Bạn có chắc chắn muốn tiếp tục?`
      )

      if (!confirmed) return

      // Second confirmation for important categories
      const doubleConfirmed = confirm(
        `🔴 XÁC NHẬN LẦN CUỐI:\n\n` +
        `Xóa tất cả ${count} email "${label}"?\n\n` +
        `Nhấn OK để xóa vĩnh viễn.`
      )

      if (!doubleConfirmed) return
    }
    // Categories không quan trọng (spam, newsletter, promotion) → Không cần confirm

    try {
      const res = await fetch('/api/emails/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          filter: { category }
        })
      })

      const data = await res.json()
      if (data.success) {
        refetch()
        setActiveFilter(null)
      } else {
        alert(data.error || 'Xóa thất bại')
      }
    } catch (error) {
      console.error('Delete all failed:', error)
      alert('Xóa thất bại')
    }
  }, [filterCounts, refetch])

  // Filtered emails
  const filteredEmails = useMemo(() => {
    // Priority 1: Briefing filter (from AI Thư Ký)
    if (briefingFilter && briefingFilter.emailIds.length > 0) {
      const emailIdSet = new Set(briefingFilter.emailIds)
      return emails.filter(email => emailIdSet.has(email.id))
    }

    // Priority 2: Category filter
    if (!activeFilter) return emails

    if (activeFilter === 'needsAction') {
      return emails.filter(email =>
        !email.is_read && (
          (email.priority || 0) >= 4 ||
          email.needs_reply ||
          email.detected_deadline
        )
      )
    }

    return emails.filter(email => email.category === activeFilter)
  }, [emails, activeFilter, briefingFilter])

  // URL-based navigation
  const handleSelectEmail = useCallback((id: string) => {
    router.push(`/inbox?email=${id}`, { scroll: false })
    setViewMode('split')
    const email = emails.find(e => e.id === id)
    if (email && !email.is_read) {
      markAsRead(id)
    }
  }, [router, emails, markAsRead])

  const handleCloseEmail = useCallback(() => {
    router.push('/inbox', { scroll: false })
    setViewMode('list')
  }, [router])

  const handleMaximize = () => {
    setViewMode(viewMode === 'full' ? 'split' : 'full')
  }

  const handleArchive = useCallback((id: string) => {
    archiveEmail(id)
    router.push('/inbox', { scroll: false })
  }, [archiveEmail, router])

  const handleDelete = useCallback((id: string) => {
    deleteEmail(id)
    router.push('/inbox', { scroll: false })
  }, [deleteEmail, router])

  // Handle clicking category tag in email list
  const handleCategoryClick = (category: string) => {
    // Clear briefing filter when selecting category filter
    if (briefingFilter) {
      setBriefingFilter(null)
      sessionStorage.removeItem('briefing_filter')
      router.push('/inbox', { scroll: false })
    }
    setActiveFilter(category)
  }

  // Clear briefing filter
  const handleClearBriefingFilter = useCallback(() => {
    setBriefingFilter(null)
    sessionStorage.removeItem('briefing_filter')
    router.push('/inbox', { scroll: false })
  }, [router])

  // Handle bulk actions from context menu or selection toolbar
  const handleBulkAction = useCallback(async (action: string, emailIds: string[], data?: Record<string, unknown>) => {
    console.log(`[BULK ACTION] ${action} on ${emailIds.length} emails`, data)

    try {
      // Handle navigation actions locally
      if (action === 'reply' || action === 'reply-all' || action === 'forward') {
        const email = emails.find(e => e.id === emailIds[0])
        if (email) {
          // Navigate to compose with reply context
          router.push(`/compose?${action}=${email.id}`)
        }
        return
      }

      // Handle summarize action - call AI
      if (action === 'summarize') {
        const email = emails.find(e => e.id === emailIds[0])
        if (email) {
          // Could show a toast or modal with AI summary
          alert('Tính năng tóm tắt AI đang được phát triển')
        }
        return
      }

      // Send bulk action to API
      const res = await fetch('/api/emails/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, emailIds, data })
      })

      const result = await res.json()

      if (result.success) {
        console.log(`[BULK ACTION] Success: ${result.count} emails updated`)
        refetch()
      } else {
        console.error('[BULK ACTION] Failed:', result.error)
        alert(result.error || 'Thao tác thất bại')
      }
    } catch (error) {
      console.error('[BULK ACTION] Error:', error)
      alert('Có lỗi xảy ra')
    }
  }, [emails, router, refetch])

  // Use fetchedEmail (full data with body) instead of list email (preview only)
  const selectedEmail = fetchedEmail

  // Show skeleton while loading initial data
  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--card)]">
        {/* Toolbar skeleton */}
        <div className="h-12 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-[var(--secondary)]" />
            <div className="w-9 h-9 rounded-lg bg-[var(--secondary)]" />
          </div>
          <div className="w-20 h-4 rounded bg-[var(--secondary)]" />
        </div>

        {/* Filter chips skeleton */}
        <div className="border-b border-[var(--border)] bg-[var(--background)] px-4 py-2">
          <div className="flex gap-1.5">
            {[80, 70, 65, 60, 70, 65].map((w, i) => (
              <div key={i} className="h-7 rounded-full bg-[var(--border)]" style={{ width: w }} />
            ))}
          </div>
        </div>

        {/* Email list skeleton */}
        <div className="flex-1 overflow-y-auto">
          <EmailListSkeleton count={10} />
        </div>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[var(--card)]">
        <div className="w-20 h-20 bg-[var(--secondary)] rounded-full flex items-center justify-center mb-4">
          <Inbox className="w-10 h-10 text-[var(--muted-foreground)]" strokeWidth={1.5} />
        </div>
        <h2 className="text-[20px] font-semibold text-[var(--foreground)] mb-2">
          Hộp thư trống
        </h2>
        <p className="text-[var(--muted)] max-w-md">
          Chưa có email nào trong hộp thư đến.
        </p>
      </div>
    )
  }

  // MOBILE: Full-screen email detail - completely replaces the inbox view
  if (isMobile && selectedId && selectedEmail) {
    return (
      <EmailDetailMobile
        email={selectedEmail}
        onBack={handleCloseEmail}
        onRefresh={refetch}
        onStar={toggleStar}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />
    )
  }

  // MOBILE: Show loading state while fetching email
  if (isMobile && selectedId && fetchingEmail) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--card)] flex flex-col items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)] mb-2" strokeWidth={1.5} />
        <p className="text-[13px] text-[var(--muted-foreground)]">Đang tải email...</p>
      </div>
    )
  }

  return (
    <SelectionProvider>
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--card)]">
      {/* Toolbar */}
      <div className="h-12 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {effectiveViewMode !== 'list' && (
            <button
              type="button"
              onClick={handleCloseEmail}
              className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <span>
            {filteredEmails.length}
            {activeFilter && ` / ${emails.length}`} email
          </span>
          {effectiveViewMode !== 'list' && (
            <button
              type="button"
              onClick={handleMaximize}
              className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-colors"
              title={viewMode === 'full' ? 'Thu nhỏ' : 'Phóng to'}
            >
              {viewMode === 'full' ? (
                <Minimize2 className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <Maximize2 className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Briefing Filter Banner - Show when filtering by AI Thư Ký */}
      {briefingFilter && effectiveViewMode !== 'full' && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            <span className="text-[13px] font-medium text-amber-800 dark:text-amber-200">
              {briefingFilter.title}
            </span>
            <span className="text-[12px] text-amber-600 dark:text-amber-400">
              ({filteredEmails.length} email)
            </span>
          </div>
          <button
            type="button"
            onClick={handleClearBriefingFilter}
            className="p-1 rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/50 text-amber-600 dark:text-amber-400 transition-colors"
            title="Xóa bộ lọc"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Filter Chips - Only show in list/split mode and when no briefing filter */}
      {effectiveViewMode !== 'full' && !briefingFilter && (
        <div className="border-b border-[var(--border)] bg-[var(--background)]">
          <FilterChips
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            counts={filterCounts}
            onClassify={handleClassify}
            classifying={classifying}
            onDeleteAll={handleDeleteAllInCategory}
            onReclassify={handleReclassify}
            reclassifying={reclassifying}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email List - Hidden on mobile when viewing email detail */}
        {effectiveViewMode !== 'full' && (
          <div className={cn(
            'border-r border-[var(--border)] overflow-hidden transition-all duration-200 bg-[var(--card)] flex flex-col',
            effectiveViewMode === 'list' ? 'flex-1' : 'hidden lg:flex lg:w-[360px]'
          )}>
            {/* Selection Toolbar - shows when emails are selected */}
            <SelectionToolbar onAction={handleBulkAction} />

            {/* Email List */}
            <div className="flex-1 overflow-y-auto">
              {filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-[var(--muted-foreground)]">
                  <p className="text-[14px]">Không có email</p>
                  {(activeFilter || briefingFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (briefingFilter) {
                          handleClearBriefingFilter()
                        } else {
                          setActiveFilter(null)
                        }
                      }}
                      className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] mt-2"
                    >
                      Xóa bộ lọc
                    </button>
                  )}
                </div>
              ) : (
                <EmailListCompact
                  emails={filteredEmails}
                  selectedId={selectedId}
                  onSelect={handleSelectEmail}
                  onStar={toggleStar}
                  onCategoryClick={handleCategoryClick}
                  compact={effectiveViewMode === 'split'}
                  smartSort={!activeFilter}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={loadMore}
                  onBulkAction={handleBulkAction}
                />
              )}
            </div>
          </div>
        )}

        {/* Email Detail */}
        {(effectiveViewMode === 'split' || effectiveViewMode === 'full') && selectedEmail && (
          <div className="flex-1 overflow-y-auto bg-[var(--card)]">
            <EmailDetailFull
              email={selectedEmail}
              onBack={handleCloseEmail}
              onRefresh={refetch}
              onStar={toggleStar}
              onArchive={handleArchive}
              onDelete={handleDelete}
              fullWidth={effectiveViewMode === 'full'}
            />
          </div>
        )}

        {/* Loading state when fetching single email */}
        {(effectiveViewMode === 'split' || effectiveViewMode === 'full') && selectedId && !selectedEmail && fetchingEmail && (
          <div className="flex-1 flex flex-col items-center justify-center bg-[var(--card)] gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" strokeWidth={1.5} />
            <p className="text-[13px] text-[var(--muted-foreground)]">Đang tải email...</p>
          </div>
        )}

        {/* Empty State when split but no selection */}
        {effectiveViewMode === 'split' && !selectedId && (
          <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
            <p className="text-[14px] text-[var(--muted-foreground)]">Chọn email để xem</p>
          </div>
        )}
      </div>
    </div>
    </SelectionProvider>
  )
}

export default function InboxPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-[var(--card)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" strokeWidth={1.5} />
      </div>
    }>
      <InboxContent />
    </Suspense>
  )
}
