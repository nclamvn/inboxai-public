'use client'

import { Suspense, useMemo, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  RefreshCw, MoreHorizontal, Inbox,
  ChevronLeft, Maximize2, Minimize2, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmails } from '@/hooks/use-emails'
import { useEmail } from '@/hooks/use-email'
import { FilterChips } from '@/components/email/filter-chips'
import { EmailListCompact } from '@/components/email/email-list-compact'
import { EmailListSkeleton } from '@/components/email/email-list-skeleton'
import { EmailDetailFull } from '@/components/email/email-detail-full'

type ViewMode = 'list' | 'split' | 'full'

function InboxContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { emails, loading, loadingMore, hasMore, toggleStar, archiveEmail, deleteEmail, markAsRead, refetch, loadMore } = useEmails({ folder: 'inbox' })

  // URL-based state - selectedId from URL
  const selectedId = searchParams.get('email')

  // Local UI state only
  const [viewMode, setViewMode] = useState<ViewMode>(selectedId ? 'split' : 'list')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [classifying, setClassifying] = useState(false)

  // Fetch single email when selectedId is set but email not in list
  const { email: fetchedEmail, loading: fetchingEmail } = useEmail(
    selectedId && !emails.find(e => e.id === selectedId) ? selectedId : null
  )

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

  // Filtered emails
  const filteredEmails = useMemo(() => {
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
  }, [emails, activeFilter])

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
    setActiveFilter(category)
  }

  // Get selected email from list or from fetched single email
  const selectedEmail = emails.find(e => e.id === selectedId) || fetchedEmail

  // Show skeleton while loading initial data
  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        {/* Toolbar skeleton */}
        <div className="h-12 border-b border-[#EBEBEB] bg-white flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-[#F5F5F5]" />
            <div className="w-9 h-9 rounded-lg bg-[#F5F5F5]" />
          </div>
          <div className="w-20 h-4 rounded bg-[#F5F5F5]" />
        </div>

        {/* Filter chips skeleton */}
        <div className="border-b border-[#EBEBEB] bg-[#FAFAFA] px-4 py-2">
          <div className="flex gap-1.5">
            {[80, 70, 65, 60, 70, 65].map((w, i) => (
              <div key={i} className="h-7 rounded-full bg-[#EBEBEB]" style={{ width: w }} />
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
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white">
        <div className="w-20 h-20 bg-[#F5F5F5] rounded-full flex items-center justify-center mb-4">
          <Inbox className="w-10 h-10 text-[#9B9B9B]" strokeWidth={1.5} />
        </div>
        <h2 className="text-[20px] font-semibold text-[#1A1A1A] mb-2">
          Hộp thư trống
        </h2>
        <p className="text-[#6B6B6B] max-w-md">
          Chưa có email nào trong hộp thư đến.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="h-12 border-b border-[#EBEBEB] bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {effectiveViewMode !== 'list' && (
            <button
              type="button"
              onClick={handleCloseEmail}
              className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[13px] text-[#6B6B6B]">
          <span>
            {filteredEmails.length}
            {activeFilter && ` / ${emails.length}`} email
          </span>
          {effectiveViewMode !== 'list' && (
            <button
              type="button"
              onClick={handleMaximize}
              className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
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

      {/* Filter Chips - Only show in list/split mode */}
      {effectiveViewMode !== 'full' && (
        <div className="border-b border-[#EBEBEB] bg-[#FAFAFA]">
          <FilterChips
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            counts={filterCounts}
            onClassify={handleClassify}
            classifying={classifying}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email List - Hidden on mobile when viewing email detail */}
        {effectiveViewMode !== 'full' && (
          <div className={cn(
            'border-r border-[#EBEBEB] overflow-y-auto transition-all duration-200 bg-white',
            effectiveViewMode === 'list' ? 'flex-1' : 'hidden lg:block lg:w-[360px]'
          )}>
            {filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[#9B9B9B]">
                <p className="text-[14px]">Không có email</p>
                {activeFilter && (
                  <button
                    type="button"
                    onClick={() => setActiveFilter(null)}
                    className="text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A] mt-2"
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
              />
            )}
          </div>
        )}

        {/* Email Detail */}
        {(effectiveViewMode === 'split' || effectiveViewMode === 'full') && selectedEmail && (
          <div className="flex-1 overflow-y-auto bg-white">
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
          <div className="flex-1 flex items-center justify-center bg-white">
            <Loader2 className="w-6 h-6 animate-spin text-[#9B9B9B]" strokeWidth={1.5} />
          </div>
        )}

        {/* Empty State when split but no selection */}
        {effectiveViewMode === 'split' && !selectedId && (
          <div className="flex-1 flex items-center justify-center bg-[#FAFAFA]">
            <p className="text-[14px] text-[#9B9B9B]">Chọn email để xem</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-[#9B9B9B]" strokeWidth={1.5} />
      </div>
    }>
      <InboxContent />
    </Suspense>
  )
}
