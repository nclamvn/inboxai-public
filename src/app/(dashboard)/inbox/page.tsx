'use client'

import { Suspense, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Loader2, X, ListFilter, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { useEmails } from '@/hooks/use-emails'
import { useBriefingFilter } from '@/hooks/use-briefing-filter'
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
import { InboxLanes } from '@/components/email/inbox-lanes'
import { AccountSwitcher } from '@/components/email/account-switcher'
import { mailCategoryLabels } from '@/components/email/mail-category-label'
import { InboxPriorityDialog } from '@/components/email/inbox-priority-dialog'
import { ReplyInbox } from '@/components/replies/reply-inbox'
import { CommitmentAttention } from '@/components/commitments/commitment-attention'
import { compareInboxPriority, rankActionInbox } from '@/lib/action-inbox/rank'
import { offlineHome, useOfflineWorkspace } from '@/components/offline/offline-provider'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'
import type { Email } from '@/types'
import { lookupCategory, mailLookupHref, returnToMailLookup } from '@/lib/search/mail-lookup'

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

const MailCategoryDialog = dynamic(() => import('@/components/email/personal-mail-rules').then(module => module.MailCategoryDialog))
const MailRulesDialog = dynamic(() => import('@/components/email/personal-mail-rules').then(module => module.MailRulesDialog))

type ViewMode = 'list' | 'split' | 'full'

function InboxContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const offline = useOfflineWorkspace()
  const notifications = offline && <NotificationDropdown owner={offline.owner} />

  // Account filter state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])

  const { userId, emails, error, loading, loadingMore, hasMore, pageError, toggleStar, archiveEmail, deleteEmail, markAsRead, changeFlags, refetch, refresh, loadMore, setInboxPriority } = useEmails({
    folder: 'inbox',
    accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined
  })

  // Use media query hook for responsive detection
  const isMobile = useIsMobile()
  const { enabled: triageEnabled } = useGmailTriage()

  // URL-based state - selectedId from URL
  const selectedId = searchParams.get('email')
  const followup = searchParams.get('followup') ?? undefined
  const lookupReturn = returnToMailLookup(searchParams.get('lookup'))
  const closeLabel = lookupReturn ? 'Về kết quả tìm kiếm' : undefined
  const lastOpenedEmail = useRef<string | null>(selectedId)
  const readOnOpen = useRef<string | null>(null)
  const briefingType = searchParams.get('briefing')

  // Local UI state only
  const [viewMode, setViewMode] = useState<ViewMode>(selectedId ? 'split' : 'list')
  const [selectedCategory, setActiveFilter] = useState<string | null>(null)
  const [dense, setDense] = useState(false)
  const [mobileSegment, setMobileSegment] = useState('all')
  const { filter: briefingFilter, clear: clearBriefingFilter } = useBriefingFilter(briefingType)
  const activeFilter = briefingFilter ? null : selectedCategory
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false)
  const [snoozeTarget, setSnoozeTarget] = useState<Email | null>(null)
  const [snoozeNotice, setSnoozeNotice] = useState(false)
  const [priorityTarget, setPriorityTarget] = useState<Email | null>(null)
  const [categoryTarget, setCategoryTarget] = useState<Email | null>(null)
  const [showMailRules, setShowMailRules] = useState(false)
  const [mailRuleNotice, setMailRuleNotice] = useState('')
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const rankings = useMemo(() => rankActionInbox(emails, now), [emails, now])

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
  const effectiveViewMode = selectedId
    ? lookupReturn ? 'full' : viewMode === 'list' ? 'split' : viewMode
    : 'list'

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

  // Category labels
  const CATEGORY_LABELS: Record<string, string> = {
    ...mailCategoryLabels,
    needsAction: 'Cần xử lý',
    needs_action: 'Cần xử lý'
  }

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

    return result.sort((a, b) => compareInboxPriority(rankings.get(a.id)!, rankings.get(b.id)!))
  }, [emails, rankings, activeFilter, briefingFilter, isMobile, mobileSegment])

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
    router.push(lookupReturn ?? '/inbox', { scroll: false })
    setViewMode('list')
  }, [router, lookupReturn])

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
      clearBriefingFilter()
      router.push('/inbox', { scroll: false })
    }
    setActiveFilter(category)
  }

  // Handle filter change from unified top bar
  const handleFilterChange = useCallback((filter: string) => {
    // Clear briefing filter when changing category
    if (briefingFilter) {
      clearBriefingFilter()
      router.push('/inbox', { scroll: false })
    }
    setActiveFilter(filter === 'all' ? null : filter)
  }, [briefingFilter, router, clearBriefingFilter])

  // Handle search
  const handleSearch = useCallback((query: string) => {
    router.push(mailLookupHref({
      query, accounts: selectedAccountIds, category: lookupCategory(activeFilter), hasFile: false,
    }))
  }, [router, selectedAccountIds, activeFilter])

  // Clear briefing filter
  const handleClearBriefingFilter = useCallback(() => {
    clearBriefingFilter()
    router.push('/inbox', { scroll: false })
  }, [router, clearBriefingFilter])

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

  function refreshCategories() {
    void refresh()
    if (selectedId) void refetchEmail()
    window.dispatchEvent(new Event('inbox-priority-changed'))
  }

  const categoryDialogs = <>
    {categoryTarget && <MailCategoryDialog key={categoryTarget.id} email={categoryTarget}
      onClose={() => setCategoryTarget(null)} onSaved={message => {
        setCategoryTarget(null)
        setMailRuleNotice(message)
        refreshCategories()
      }} />}
    {showMailRules && <MailRulesDialog onClose={() => setShowMailRules(false)} onChanged={refreshCategories} />}
  </>
  const ruleButton = (
    <button type="button" onClick={() => setShowMailRules(true)}
      className="neo-target inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm text-[var(--accent-foreground)] hover:bg-[var(--hover)]">
      <ListChecks size={16} aria-hidden="true" />
      Quy tắc
    </button>
  )
  const offlineLink = offline?.scope?.enrolled && (
    <a href={offlineHome} className="neo-target inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-[var(--accent-foreground)] underline">
      Ngoại tuyến
    </a>
  )
  const ruleStatus = mailRuleNotice && <p role="status" className="border-b border-[var(--border)] px-4 py-2 text-sm">{mailRuleNotice}</p>
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
          closeLabel={closeLabel}
          onRefresh={refetch}
          onStar={id => void toggleStar(id, fetchedEmail?.id === id ? fetchedEmail : undefined)}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onSnooze={snoozeSelected}
          onExplainPriority={explainSelected}
          onEditCategory={!selectedEmail.provider_deleted ? () => {
            setMailRuleNotice('')
            setCategoryTarget(selectedEmail)
          } : undefined}
          categoryNotice={mailRuleNotice}
        />
        {categoryDialogs}
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
          notifications={notifications}
        />
      ) : (
        <header className="neo-inbox-header border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="neo-inbox-heading flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-3">
              <h1 className="neo-title shrink-0">Hộp thư</h1>
              <span className="truncate text-xs tabular-nums text-[var(--foreground-muted)]">{filterCounts.unread || 0} chưa đọc</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {notifications}
              {offlineLink}
              {ruleButton}
              <AccountSwitcher selectedAccountIds={selectedAccountIds} onAccountChange={setSelectedAccountIds} />
            </div>
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

      {isMobile && <div className="neo-mobile-tools flex flex-wrap items-center gap-x-3 border-b border-[var(--border)] px-4">
        <AccountSwitcher selectedAccountIds={selectedAccountIds} onAccountChange={setSelectedAccountIds} />
        <Link href="/snoozed" className="neo-target flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline">Đã hẹn</Link>
        {ruleButton}
        {offlineLink}
      </div>}
      {!isMobile && <InboxLanes current={activeFilter || 'all'} counts={filterCounts} onChange={handleFilterChange}
        dense={dense} onDensityChange={setDense} hasMore={hasMore} />}
      {ruleStatus}
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
      <div data-mail-density={dense ? 'compact' : 'comfortable'} className="neo-inbox-content flex-1 flex overflow-hidden">
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
              {userId && !selectedId && (followup || (!activeFilter && !briefingFilter && (!isMobile || mobileSegment === 'all'))) &&
                <ReplyInbox key={'replies:' + userId} userId={userId} accounts={followup ? [] : selectedAccountIds} focus={followup} />}
              {userId && !selectedId && !activeFilter && !briefingFilter && (!isMobile || mobileSegment === 'all') &&
                <CommitmentAttention key={userId} userId={userId} accounts={selectedAccountIds} onSynced={refresh} />}
              {error && emails.length === 0 ? (
                <EmptyState type="error" title="Chưa tải được hộp thư"
                  description="Kiểm tra kết nối rồi thử tải lại."
                  action={{ label: 'Tải lại', onClick: refetch }}
                />
              ) : filteredEmails.length === 0 ? (
                <>
                  <EmptyState
                    type={emails.length === 0 ? 'no-emails' : 'empty-folder'}
                    description={emails.length === 0 ? 'Thư mới sẽ xuất hiện sau khi đồng bộ.' : undefined}
                    className="py-8"
                    action={(activeFilter || briefingFilter) ? {
                      label: 'Xóa bộ lọc',
                      onClick: () => {
                        if (briefingFilter) {
                          handleClearBriefingFilter()
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
                  onEditCategory={setCategoryTarget}
                  compact={effectiveViewMode === 'split'}
                  groupByPriority={!activeFilter && !briefingFilter && (!isMobile || mobileSegment === 'all')}
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
              closeLabel={closeLabel}
              onRefresh={refreshCategories}
              onStar={id => void toggleStar(id, fetchedEmail?.id === id ? fetchedEmail : undefined)}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onSnooze={snoozeSelected}
              fullWidth={effectiveViewMode === 'full'}
              onExplainPriority={explainSelected}
              onEditCategory={!selectedEmail.provider_deleted ? () => setCategoryTarget(selectedEmail) : undefined}
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
            <button type="button" onClick={handleCloseEmail} className="neo-target mx-auto block px-3 py-2 text-sm text-[var(--accent-foreground)] underline">{closeLabel ?? 'Về hộp thư'}</button>
          </div>
        )}

        {/* Empty State when split but no selection */}
        {effectiveViewMode === 'split' && !selectedId && (
          <div className="flex-1 bg-[var(--background)]">
            <EmptyState type="no-selection" />
          </div>
        )}
      </div>

      {categoryDialogs}
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
