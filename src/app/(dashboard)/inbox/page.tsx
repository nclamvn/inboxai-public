'use client'

import { Suspense, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Loader2, X, ListFilter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { useEmails } from '@/hooks/use-emails'
import { useEmail } from '@/hooks/use-email'
import { useIsMobile } from '@/hooks/use-media-query'
// FilterChips removed - replaced by UnifiedTopBar dropdown
import { EmailListSkeleton } from '@/components/email/email-list-skeleton'
import { SelectionProvider } from '@/contexts/email-selection-context'
import { gmailTriageRefresh, triageActions, useGmailTriage } from '@/components/email/gmail-triage'
import { EmailSnoozeDialog } from '@/components/email/email-snooze-dialog'
import { SelectionToolbar } from '@/components/email/selection-toolbar'
import { UnifiedTopBar } from '@/components/layout/unified-top-bar'
import { MobileInboxHeader } from '@/components/layout/mobile-inbox-header'
import { CategoryFilterSheet } from '@/components/layout/category-filter-sheet'
import { AccountSwitcher } from '@/components/email/account-switcher'
import { InboxPriorityDialog } from '@/components/email/inbox-priority-dialog'
import { ReplyInbox } from '@/components/replies/reply-inbox'
import { CommitmentAttention } from '@/components/commitments/commitment-attention'
import { compareInboxPriority, rankActionInbox } from '@/lib/action-inbox/rank'
import type { Email } from '@/types'

// Dynamic imports for code splitting - heavy components loaded on demand
const EmailListCompact = dynamic(
  () => import('@/components/email/email-list-compact').then(mod => ({ default: mod.EmailListCompact })),
  {
    loading: () => <EmailListSkeleton count={10} />,
  }
)

const EmailDetailFull = dynamic(
  () => import('@/components/email/email-detail-full').then(mod => ({ default: mod.EmailDetailFull })),
  {
    loading: () => (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--card)] gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" strokeWidth={1.5} />
        <p className="text-[13px] text-[var(--muted-foreground)]">Dang tai...</p>
      </div>
    ),
  }
)

const EmailDetailMobile = dynamic(
  () => import('@/components/email/email-detail-mobile').then(mod => ({ default: mod.EmailDetailMobile })),
  {
    loading: () => (
      <div className="fixed inset-0 z-50 bg-[var(--card)] flex flex-col items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)] mb-2" strokeWidth={1.5} />
        <p className="text-[13px] text-[var(--muted-foreground)]">Dang tai...</p>
      </div>
    ),
  }
)

type ViewMode = 'list' | 'split' | 'full'

interface BriefingFilter {
  type: string
  title: string
  emailIds: string[]
}

function InboxContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Account filter state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])

  const { userId, emails, error, loading, loadingMore, hasMore, pageError, toggleStar, archiveEmail, deleteEmail, markAsRead, changeFlags, refetch, loadMore, setInboxPriority } = useEmails({
    folder: 'inbox',
    accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined
  })

  // Use media query hook for responsive detection
  const isMobile = useIsMobile()
  const { enabled: triageEnabled } = useGmailTriage()

  // URL-based state - selectedId from URL
  const selectedId = searchParams.get('email')
  const lastOpenedEmail = useRef<string | null>(selectedId)
  const readOnOpen = useRef<string | null>(null)
  const briefingType = searchParams.get('briefing')

  // Local UI state only
  const [viewMode, setViewMode] = useState<ViewMode>(selectedId ? 'split' : 'list')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [mobileSegment, setMobileSegment] = useState('all')
  const [briefingFilter, setBriefingFilter] = useState<BriefingFilter | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [snoozeTarget, setSnoozeTarget] = useState<Email | null>(null)
  const [snoozeNotice, setSnoozeNotice] = useState(false)
  const [priorityTarget, setPriorityTarget] = useState<Email | null>(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const rankings = useMemo(() => rankActionInbox(emails, now), [emails, now])

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
  const { email: fetchedEmail, loading: fetchingEmail, error: sourceError, refetch: refetchEmail } = useEmail(selectedId)

  useEffect(() => {
    if (!triageEnabled || !selectedId) return
    const refresh = () => { void refetchEmail() }
    window.addEventListener(gmailTriageRefresh, refresh)
    return () => window.removeEventListener(gmailTriageRefresh, refresh)
  }, [triageEnabled, selectedId, refetchEmail])

  useEffect(() => {
    if (!selectedId) readOnOpen.current = null
    if (!triageEnabled || !fetchedEmail || fetchedEmail.sync_namespace !== 'gmail' ||
      fetchedEmail.is_deleted || fetchedEmail.provider_deleted || readOnOpen.current === selectedId) return
    readOnOpen.current = selectedId
    if (!fetchedEmail.is_read) void markAsRead(fetchedEmail.id, fetchedEmail)
  }, [triageEnabled, selectedId, fetchedEmail, markAsRead])

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
      needs_action: 0,
      needsAction: 0, // Legacy alias
      unread: 0,
      important: 0,
    }

    emails.forEach(email => {
      if (email.category) {
        const cat = email.category as keyof typeof counts
        if (cat in counts) {
          counts[cat]++
        }
      }

      if (!email.is_read) {
        counts.unread++
      }

      if (rankings.get(email.id)?.band === 'action') {
        counts.important++
        counts.needs_action++
        counts.needsAction++
      }
    })

    return counts
  }, [emails, rankings])

  // Categories quan trọng cần warning
  const IMPORTANT_CATEGORIES = ['work', 'personal', 'transaction', 'needsAction', 'needs_action']

  // Category labels
  const CATEGORY_LABELS: Record<string, string> = {
    work: 'Công việc',
    personal: 'Cá nhân',
    transaction: 'Giao dịch',
    newsletter: 'Newsletter',
    promotion: 'Khuyến mãi',
    social: 'Mạng XH',
    spam: 'Spam',
    needsAction: 'Cần xử lý',
    needs_action: 'Cần xử lý'
  }

  // Handle delete all in category - với SMART WARNING
  const handleDeleteAllInCategory = useCallback(async (category: string) => {
    const count = (filterCounts as Record<string, number>)[category] || 0
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
    let result = [...emails]

    // Priority 1: Briefing filter (from AI Thư Ký)
    if (briefingFilter && briefingFilter.emailIds.length > 0) {
      const emailIdSet = new Set(briefingFilter.emailIds)
      return result.filter(email => emailIdSet.has(email.id))
    }

    const needsAction = (email: Email) => rankings.get(email.id)?.band === 'action'
    if (isMobile && mobileSegment === 'unread') result = result.filter(email => !email.is_read)
    if (isMobile && mobileSegment === 'important') result = result.filter(needsAction)

    if (activeFilter === 'needs_action' || activeFilter === 'needsAction') {
      result = result.filter(needsAction)
    } else if (activeFilter && activeFilter !== 'all') {
      result = result.filter(email => email.category === activeFilter)
    }

    // Priority 3: Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(email =>
        email.subject?.toLowerCase().includes(query) ||
        email.from_name?.toLowerCase().includes(query) ||
        email.from_address?.toLowerCase().includes(query) ||
        email.snippet?.toLowerCase().includes(query)
      )
    }

    return result.sort((a, b) => compareInboxPriority(rankings.get(a.id)!, rankings.get(b.id)!))
  }, [emails, rankings, activeFilter, briefingFilter, isMobile, mobileSegment, searchQuery])

  // URL-based navigation
  const handleSelectEmail = useCallback((id: string) => {
    router.push(`/inbox?email=${id}`, { scroll: false })
    setViewMode('split')
    const email = emails.find(e => e.id === id)
    if (email && !email.is_read && !(triageEnabled && email.sync_namespace === 'gmail')) {
      void markAsRead(id)
    }
  }, [router, emails, markAsRead, triageEnabled])

  const handleCloseEmail = useCallback(() => {
    router.push('/inbox', { scroll: false })
    setViewMode('list')
  }, [router])

  useEffect(() => {
    if (!selectedId) return
    const back = (event: Event) => {
      event.preventDefault()
      handleCloseEmail()
    }
    window.addEventListener('inboxai:native-back', back)
    return () => window.removeEventListener('inboxai:native-back', back)
  }, [selectedId, handleCloseEmail])

  useEffect(() => {
    if (selectedId) {
      lastOpenedEmail.current = selectedId
      return
    }
    const emailId = lastOpenedEmail.current
    if (loading || !emailId) return
    lastOpenedEmail.current = null
    const opener = document.querySelector<HTMLElement>(`[data-email-opener="${CSS.escape(emailId)}"]`)
    const target = opener ?? document.getElementById('main-content')
    target?.focus()
  }, [selectedId, loading])

  const handleMaximize = () => {
    setViewMode(viewMode === 'full' ? 'split' : 'full')
  }

  const handleArchive = useCallback((id: string) => {
    void archiveEmail(id, fetchedEmail?.id === id ? fetchedEmail : undefined)
    router.push('/inbox', { scroll: false })
  }, [archiveEmail, fetchedEmail, router])

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

  // Handle filter change from unified top bar
  const handleFilterChange = useCallback((filter: string) => {
    // Clear briefing filter when changing category
    if (briefingFilter) {
      setBriefingFilter(null)
      sessionStorage.removeItem('briefing_filter')
      router.push('/inbox', { scroll: false })
    }
    setActiveFilter(filter === 'all' ? null : filter)
  }, [briefingFilter, router])

  // Handle search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

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
      if (action === 'snooze') {
        const email = emails.find(row => row.id === emailIds[0])
        if (email && emailIds.length === 1) setSnoozeTarget(email)
        return
      }

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

      const triage = triageActions[action]
      if (triageEnabled && triage) {
        const targets = emailIds.map(id => emails.find(email => email.id === id) ??
          (fetchedEmail?.id === id ? fetchedEmail : undefined))
        if (targets.some(email => !email)) return
        await changeFlags(targets.filter((email): email is Email => !!email), triage.flag, triage.desired)
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
  }, [emails, fetchedEmail, router, refetch, triageEnabled, changeFlags])

  const selectedEmail = fetchedEmail
  const snoozeSelected = selectedEmail?.direction === 'inbound' && !selectedEmail.is_archived &&
    !selectedEmail.is_deleted && !selectedEmail.provider_deleted ? () => setSnoozeTarget(selectedEmail) : undefined
  const snoozeDialog = snoozeTarget && <EmailSnoozeDialog email={snoozeTarget}
    mode={snoozeTarget.snoozed_until ? 'move' : 'schedule'}
    onClose={() => setSnoozeTarget(null)} onSaved={() => {
      setSnoozeNotice(true)
      if (selectedId === snoozeTarget.id) handleCloseEmail()
    }} />
  const explainSelected = selectedEmail?.direction === 'inbound' &&
    !selectedEmail.is_deleted && !selectedEmail.is_archived && !selectedEmail.provider_deleted
    ? () => setPriorityTarget(selectedEmail)
    : undefined
  const priorityEmail = priorityTarget && (emails.find(email => email.id === priorityTarget.id) ?? priorityTarget)
  const priorityRanking = priorityEmail && (rankings.get(priorityEmail.id) ?? rankActionInbox([{
    ...priorityEmail,
    snippet: priorityEmail.snippet || priorityEmail.body_text?.slice(0, 480) || null,
  }], now).get(priorityEmail.id))
  const priorityDialog = priorityEmail && priorityRanking && (
    <InboxPriorityDialog
      key={priorityEmail.id}
      email={priorityEmail}
      ranking={priorityRanking}
      onClose={() => setPriorityTarget(null)}
      onOpenSource={id => {
        setPriorityTarget(null)
        if (id !== selectedId) handleSelectEmail(id)
      }}
      onSave={async (id, choice, version) => {
        const result = await setInboxPriority(id, choice, version)
        setPriorityTarget(previous => previous?.id === id
          ? { ...previous, inbox_priority: result.choice, inbox_priority_version: result.version }
          : previous)
        if (id === selectedId && !rankings.has(id)) void refetchEmail()
        return result
      }}
    />
  )

  // Show skeleton while loading initial data
  if (loading) {
    return (
      <div role="status" aria-label="Đang tải hộp thư" className="flex h-full flex-col overflow-hidden bg-[var(--surface)]">
        {/* Header skeleton */}
        {isMobile ? (
          <div className="bg-[var(--card)] px-4 py-3">
            <div className="h-8 w-24 bg-[var(--secondary)] rounded animate-pulse mb-3" />
            <div className="h-10 bg-[var(--secondary)] rounded-xl animate-pulse" />
          </div>
        ) : (
          <div className="h-[52px] border-b border-[var(--border)] bg-[var(--card)] flex items-center gap-3 px-4">
            <div className="flex-1 h-10 bg-[var(--secondary)] rounded-xl animate-pulse" />
            <div className="w-32 h-10 bg-[var(--secondary)] rounded-xl animate-pulse" />
          </div>
        )}

        {/* Email list skeleton */}
        <div className="flex-1 overflow-y-auto">
          <EmailListSkeleton count={10} />
        </div>
      </div>
    )
  }

  // MOBILE: Full-screen email detail - completely replaces the inbox view
  if (isMobile && selectedId && selectedEmail) {
    return (
      <>
        <EmailDetailMobile
          email={selectedEmail}
          onBack={handleCloseEmail}
          onRefresh={refetch}
          onStar={id => void toggleStar(id, fetchedEmail?.id === id ? fetchedEmail : undefined)}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onSnooze={snoozeSelected}
          onExplainPriority={explainSelected}
        />
        {priorityDialog}
        {snoozeDialog}
      </>
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
      {/* Header - Responsive */}
      {isMobile ? (
        <MobileInboxHeader
          currentSegment={mobileSegment}
          onSegmentChange={setMobileSegment}
          unreadCount={filterCounts.unread || 0}
          importantCount={filterCounts.important || 0}
          onSearch={handleSearch}
          onFilterClick={() => setIsCategorySheetOpen(true)}
          title={activeFilter ? CATEGORY_LABELS[activeFilter] || 'Hộp thư' : 'Hộp thư'}
        />
      ) : (
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[var(--border)] px-5">
            <div className="flex min-w-0 items-baseline gap-3">
              <h1 className="neo-title shrink-0">Hộp thư</h1>
              <span className="truncate text-xs tabular-nums text-[var(--foreground-muted)]">{filterCounts.unread || 0} chưa đọc</span>
            </div>
            <AccountSwitcher selectedAccountIds={selectedAccountIds} onAccountChange={setSelectedAccountIds} />
          </div>
          <UnifiedTopBar
            currentFilter={activeFilter || 'all'}
            onFilterChange={handleFilterChange}
            emailCounts={filterCounts}
            onSearch={handleSearch}
            onProfileClick={() => router.push('/settings')}
            noBorder
          />
        </header>
      )}

      {isMobile && <Link href="/snoozed" className="neo-target flex min-h-11 items-center border-b border-[var(--border)] px-4 text-sm text-[var(--accent-foreground)] underline">Đã hẹn</Link>}
      {snoozeNotice && <p role="status" className="border-b border-[var(--border)] px-4 py-2 text-sm">
        Đã lưu lịch xử lý. <Link href="/snoozed" className="inline-flex min-h-8 items-center text-[var(--accent-foreground)] underline">Xem thư đã hẹn</Link>
      </p>}

      {/* Briefing Filter Banner - Show when filtering by AI Thư Ký */}
      {briefingFilter && effectiveViewMode !== 'full' && (
        <div className="flex items-center justify-between border-b border-s-2 border-[var(--border)] border-s-[var(--selection-line)] px-4 py-2">
          <div className="flex items-center gap-2">
            <ListFilter className="w-4 h-4 text-[var(--accent-foreground)]" strokeWidth={1.5} />
            <span className="text-[13px] font-medium text-[var(--foreground)]">
              {briefingFilter.title}
            </span>
            <span className="text-[12px] text-[var(--foreground-muted)]">
              ({filteredEmails.length} email)
            </span>
          </div>
          <button
            type="button"
            onClick={handleClearBriefingFilter}
            className="neo-icon-button"
            aria-label="Xóa bộ lọc"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email List - Hidden on mobile when viewing email detail */}
        {effectiveViewMode !== 'full' && (
          <div className={cn(
            'overflow-hidden bg-[var(--surface)] flex flex-col',
            effectiveViewMode === 'list' ? 'flex-1' : 'hidden border-e border-[var(--border)] lg:flex lg:w-[34%] lg:min-w-[320px] lg:max-w-[440px]'
          )}>
            {/* Selection Toolbar - shows when emails are selected */}
            <SelectionToolbar onAction={handleBulkAction} triageFolder={triageEnabled ? 'inbox' : undefined} />

            {/* Email List */}
            <div className="flex-1 overflow-y-auto">
              {userId && !selectedId && !activeFilter && !briefingFilter && !searchQuery && (!isMobile || mobileSegment === 'all') && (
                <>
                  <ReplyInbox key={'replies:' + userId} userId={userId} accounts={selectedAccountIds} />
                  <CommitmentAttention key={userId} userId={userId} accounts={selectedAccountIds} />
                </>
              )}
              {error && emails.length === 0 ? (
                <EmptyState type="error" title="Chưa tải được hộp thư"
                  description="Kiểm tra kết nối rồi thử tải lại."
                  action={{ label: 'Tải lại', onClick: refetch }}
                />
              ) : filteredEmails.length === 0 ? (
                <>
                  <EmptyState
                    type={searchQuery ? 'no-results' : emails.length === 0 ? 'no-emails' : 'empty-folder'}
                    description={emails.length === 0 && !searchQuery ? 'Thư mới sẽ xuất hiện sau khi đồng bộ.' : undefined}
                    className="py-8"
                    action={(activeFilter || briefingFilter || searchQuery) ? {
                      label: 'Xóa bộ lọc',
                      onClick: () => {
                        if (briefingFilter) {
                          handleClearBriefingFilter()
                        } else if (searchQuery) {
                          setSearchQuery('')
                        } else {
                          setActiveFilter(null)
                        }
                      }
                    } : emails.length === 0 ? { label: 'Quản lý tài khoản', onClick: () => router.push('/settings') } : undefined}
                  />
                  {hasMore && (
                    <div className="px-4 pb-4 text-center">
                      <p role="status" className="text-sm text-[var(--foreground-muted)]">
                        {pageError ? 'Chưa tải được trang tiếp theo.' : 'Có thể còn thư phù hợp ở các trang chưa tải.'}
                      </p>
                      <button type="button" onClick={loadMore} disabled={loadingMore}
                        className="neo-target px-3 py-2 text-sm text-[var(--accent-foreground)] underline disabled:opacity-50">
                        {loadingMore ? 'Đang tải thêm…' : pageError ? 'Thử tải thêm' : 'Tải thêm'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <EmailListCompact
                  emails={filteredEmails}
                  selectedId={selectedId}
                  onSelect={handleSelectEmail}
                  onStar={id => void toggleStar(id, fetchedEmail?.id === id ? fetchedEmail : undefined)}
                  onCategoryClick={handleCategoryClick}
                  compact={effectiveViewMode === 'split'}
                  groupByPriority={!activeFilter && !briefingFilter && !searchQuery && (!isMobile || mobileSegment === 'all')}
                  rankings={rankings}
                  onExplainPriority={setPriorityTarget}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  pageError={pageError}
                  onLoadMore={loadMore}
                  onBulkAction={handleBulkAction}
                />
              )}
            </div>
          </div>
        )}

        {/* Email Detail - Takes 70% in split mode */}
        {(effectiveViewMode === 'split' || effectiveViewMode === 'full') && selectedEmail && (
          <div className="min-w-0 flex-1 overflow-hidden bg-[var(--card)]">
            <EmailDetailFull
              email={selectedEmail}
              onBack={handleCloseEmail}
              onRefresh={refetch}
              onStar={id => void toggleStar(id, fetchedEmail?.id === id ? fetchedEmail : undefined)}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onSnooze={snoozeSelected}
              fullWidth={effectiveViewMode === 'full'}
              onExplainPriority={explainSelected}
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

        {selectedId && !selectedEmail && sourceError && !fetchingEmail && (
          <div className="min-w-0 flex-1 bg-[var(--surface)]">
            <EmptyState type="error" title="Chưa mở được email nguồn"
              description="Thư có thể không còn khả dụng. Bạn có thể thử lại."
              action={<button type="button" onClick={() => void refetchEmail()} className="neo-target px-3 py-2 text-sm text-[var(--accent-foreground)] underline">Thử mở lại</button>}
            />
            <button type="button" onClick={handleCloseEmail} className="neo-target mx-auto block px-3 py-2 text-sm text-[var(--accent-foreground)] underline">Về hộp thư</button>
          </div>
        )}

        {/* Empty State when split but no selection */}
        {effectiveViewMode === 'split' && !selectedId && (
          <div className="flex-1 bg-[var(--background)]">
            <EmptyState type="no-selection" />
          </div>
        )}
      </div>

      {priorityDialog}
      {snoozeDialog}

      {/* Mobile: Category Filter Sheet */}
      {isMobile && (
        <CategoryFilterSheet
          isOpen={isCategorySheetOpen}
          onClose={() => setIsCategorySheetOpen(false)}
          currentCategory={activeFilter || 'all'}
          onCategoryChange={handleFilterChange}
          emailCounts={filterCounts}
        />
      )}
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
