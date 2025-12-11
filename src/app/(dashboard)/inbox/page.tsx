'use client'

import { useState, useMemo } from 'react'
import {
  RefreshCw, MoreHorizontal, Inbox,
  ChevronLeft, Maximize2, Minimize2, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmails } from '@/hooks/use-emails'
import { FilterChips } from '@/components/email/filter-chips'
import { EmailListCompact } from '@/components/email/email-list-compact'
import { EmailDetailFull } from '@/components/email/email-detail-full'
import type { Email } from '@/types'

type ViewMode = 'list' | 'split' | 'full'

export default function InboxPage() {
  const { emails, loading, toggleStar, archiveEmail, deleteEmail, markAsRead, refetch } = useEmails({ folder: 'inbox' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

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
      // Category counts
      if (email.category) {
        const cat = email.category as keyof typeof counts
        if (cat in counts) {
          (counts as Record<string, number>)[cat]++
        }
      }

      // Needs action: unread + (high priority OR needs_reply OR has deadline)
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

  const handleSelectEmail = (id: string) => {
    setSelectedId(id)
    setViewMode('split')
    const email = emails.find(e => e.id === id)
    if (email && !email.is_read) {
      markAsRead(id)
    }
  }

  const handleBack = () => {
    setSelectedId(null)
    setViewMode('list')
  }

  const handleMaximize = () => {
    setViewMode(viewMode === 'full' ? 'split' : 'full')
  }

  const handleArchive = (id: string) => {
    archiveEmail(id)
    handleBack()
  }

  const handleDelete = (id: string) => {
    deleteEmail(id)
    handleBack()
  }

  // Handle clicking category tag in email list
  const handleCategoryClick = (category: string) => {
    setActiveFilter(category)
  }

  const selectedEmail = emails.find(e => e.id === selectedId)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-[#9B9B9B]" strokeWidth={1.5} />
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
          {viewMode !== 'list' && (
            <button
              onClick={handleBack}
              className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} strokeWidth={1.5} />
          </button>
          <button className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors">
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[13px] text-[#6B6B6B]">
          <span>
            {filteredEmails.length}
            {activeFilter && ` / ${emails.length}`} email
          </span>
          {viewMode !== 'list' && (
            <button
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
      {viewMode !== 'full' && (
        <div className="border-b border-[#EBEBEB] bg-[#FAFAFA]">
          <FilterChips
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            counts={filterCounts}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email List */}
        {viewMode !== 'full' && (
          <div className={cn(
            'border-r border-[#EBEBEB] overflow-y-auto transition-all duration-200 bg-white',
            viewMode === 'list' ? 'flex-1' : 'w-[360px]'
          )}>
            {filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[#9B9B9B]">
                <p className="text-[14px]">Không có email</p>
                {activeFilter && (
                  <button
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
                compact={viewMode === 'split'}
                smartSort={!activeFilter}
              />
            )}
          </div>
        )}

        {/* Email Detail */}
        {(viewMode === 'split' || viewMode === 'full') && selectedEmail && (
          <div className="flex-1 overflow-y-auto bg-white">
            <EmailDetailFull
              email={selectedEmail}
              onBack={handleBack}
              onRefresh={refetch}
              onStar={toggleStar}
              onArchive={handleArchive}
              onDelete={handleDelete}
              fullWidth={viewMode === 'full'}
            />
          </div>
        )}

        {/* Empty State when split but no selection */}
        {viewMode === 'split' && !selectedEmail && (
          <div className="flex-1 flex items-center justify-center bg-[#FAFAFA]">
            <p className="text-[14px] text-[#9B9B9B]">Chọn email để xem</p>
          </div>
        )}
      </div>
    </div>
  )
}
