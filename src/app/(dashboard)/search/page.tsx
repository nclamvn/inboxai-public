'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, Bookmark, ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SearchBox } from '@/components/search/search-box'
import { EmailDetailFull } from '@/components/email/email-detail-full'
import type { Email } from '@/types'

interface SearchResult {
  emails: (Email & { _highlights?: { subject?: string; body_preview?: string; from_name?: string } })[]
  total: number
  query: Record<string, unknown>
}

function SearchContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialQuery = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'split'>('list')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Search when query changes
  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery)
    }
  }, [initialQuery])

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/emails/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setResults(data)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery)
    router.push(`/search?q=${encodeURIComponent(newQuery)}`)
    performSearch(newQuery)
  }

  const handleSaveSearch = async () => {
    if (!query.trim()) return

    await fetch('/api/search/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), save: true })
    })

    setSaveMessage('Đã lưu tìm kiếm')
    setTimeout(() => setSaveMessage(null), 2000)
  }

  const handleSelectEmail = (id: string) => {
    setSelectedId(id)
    setViewMode('split')
  }

  const handleBack = () => {
    setSelectedId(null)
    setViewMode('list')
  }

  const selectedEmail = results?.emails.find(e => e.id === selectedId)

  // Highlight text helper
  const renderHighlightedText = (text: string | null | undefined) => {
    if (!text) return null
    const html = text
      .replace(/\[\[HIGHLIGHT\]\]/g, '<mark class="bg-[#FEF9C3] text-[#1A1A1A] px-0.5 rounded">')
      .replace(/\[\[\/HIGHLIGHT\]\]/g, '</mark>')
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Hôm qua'
    } else if (diffDays < 7) {
      return `${diffDays} ngày trước`
    } else {
      return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* Search Header */}
      <div className="border-b border-[#EBEBEB] bg-white">
        <div className="flex items-center gap-4 px-4 py-3">
          <button
            onClick={() => router.push('/inbox')}
            className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>

          <div className="flex-1 max-w-2xl">
            <SearchBox
              defaultValue={query}
              onSearch={handleSearch}
              autoFocus
            />
          </div>

          {query && (
            <button
              onClick={handleSaveSearch}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
            >
              <Bookmark className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-[13px]">Lưu</span>
            </button>
          )}
        </div>

        {/* Results summary */}
        {results && (
          <div className="px-4 py-2 border-t border-[#EBEBEB] bg-[#FAFAFA]">
            <p className="text-[13px] text-[#6B6B6B]">
              Tìm thấy <span className="font-medium text-[#1A1A1A]">{results.total}</span> kết quả
              {query && <span> cho &quot;<span className="font-medium text-[#1A1A1A]">{query}</span>&quot;</span>}
            </p>
          </div>
        )}

        {/* Save message */}
        {saveMessage && (
          <div className="px-4 py-2 bg-[#F0FDF4] border-t border-[#DCFCE7]">
            <p className="text-[13px] text-[#16A34A]">{saveMessage}</p>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email List */}
        {viewMode === 'list' || !selectedEmail ? (
          <div className="flex-1 overflow-y-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-[#9B9B9B]" strokeWidth={1.5} />
              </div>
            ) : !results ? (
              <div className="flex flex-col items-center justify-center h-64 text-[#9B9B9B]">
                <Search className="w-12 h-12 mb-4 text-[#D4D4D4]" strokeWidth={1} />
                <p className="text-[15px] font-medium text-[#6B6B6B]">Tìm kiếm email</p>
                <p className="text-[13px] mt-1">Sử dụng toán tử như from:, subject:, is:unread</p>
              </div>
            ) : results.emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-[#9B9B9B]">
                <Search className="w-12 h-12 mb-4 text-[#D4D4D4]" strokeWidth={1} />
                <p className="text-[15px] font-medium text-[#6B6B6B]">Không tìm thấy kết quả</p>
                <p className="text-[13px] mt-1">Thử tìm với từ khóa khác</p>
              </div>
            ) : (
              <div className="divide-y divide-[#EBEBEB]">
                {results.emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => handleSelectEmail(email.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors',
                      selectedId === email.id ? 'bg-[#F5F5F5]' : 'hover:bg-[#FAFAFA]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Sender */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              'text-[14px] truncate',
                              email.is_read ? 'font-medium text-[#4B4B4B]' : 'font-bold text-[#1A1A1A]'
                            )}
                          >
                            {email._highlights?.from_name
                              ? renderHighlightedText(email._highlights.from_name)
                              : (email.from_name || email.from_address)}
                          </span>
                          <span className="text-[12px] text-[#9B9B9B] flex-shrink-0">
                            {formatDate(email.received_at)}
                          </span>
                        </div>

                        {/* Subject */}
                        <p
                          className={cn(
                            'text-[14px] truncate mt-0.5',
                            email.is_read ? 'text-[#6B6B6B]' : 'font-semibold text-[#1A1A1A]'
                          )}
                        >
                          {email._highlights?.subject
                            ? renderHighlightedText(email._highlights.subject)
                            : email.subject}
                        </p>

                        {/* Preview with highlights */}
                        <p className="text-[13px] text-[#9B9B9B] truncate mt-0.5">
                          {email._highlights?.body_preview
                            ? renderHighlightedText(email._highlights.body_preview)
                            : email.body_text?.slice(0, 100)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Email Detail */}
        {viewMode === 'split' && selectedEmail && (
          <>
            {/* Narrow list */}
            <div className="w-[320px] border-r border-[#EBEBEB] overflow-y-auto bg-white">
              <div className="divide-y divide-[#F5F5F5]">
                {results?.emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => handleSelectEmail(email.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 transition-colors',
                      selectedId === email.id ? 'bg-[#F5F5F5]' : 'hover:bg-[#FAFAFA]'
                    )}
                  >
                    <p className={cn(
                      'text-[13px] truncate',
                      email.is_read ? 'text-[#6B6B6B]' : 'font-medium text-[#1A1A1A]'
                    )}>
                      {email.from_name || email.from_address}
                    </p>
                    <p className="text-[12px] text-[#9B9B9B] truncate mt-0.5">
                      {email.subject}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Detail */}
            <div className="flex-1 overflow-y-auto bg-white">
              <EmailDetailFull
                email={selectedEmail}
                onBack={handleBack}
                onRefresh={() => performSearch(query)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#9B9B9B]" strokeWidth={1.5} />
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}
