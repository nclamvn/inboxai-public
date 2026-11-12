'use client'

import { memo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Pencil, SlidersHorizontal, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { cn } from '@/lib/utils'

const segments = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'important', label: 'Cần xử lý' },
]

interface MobileInboxHeaderProps {
  currentSegment: string
  onSegmentChange: (segment: string) => void
  unreadCount: number
  importantCount: number
  onSearch: (query: string) => void
  onCompose?: () => void
  onFilterClick?: () => void
  title?: string
  className?: string
}

export const MobileInboxHeader = memo(function MobileInboxHeader({
  currentSegment, onSegmentChange, unreadCount, importantCount, onSearch, onCompose,
  onFilterClick, title = 'Hộp thư', className,
}: MobileInboxHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchButton = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)

  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
    searchButton.current?.focus()
  }

  return (
    <header className={cn('border-b border-[var(--border)] bg-[var(--surface)]', className)}>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-2 px-4 py-2">
        <h1 className="neo-title min-w-0">{title}</h1>
        <div className="flex items-center">
          <button
            ref={searchButton} type="button" aria-label="Tìm email" aria-expanded={searchOpen}
            className="neo-icon-button"
            onClick={() => {
              if (searchOpen) closeSearch()
              else {
                setSearchOpen(true)
                requestAnimationFrame(() => input.current?.focus())
              }
            }}
          >
            <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <ThemeToggle />
          {onCompose && (
            <button type="button" aria-label="Soạn thư" onClick={onCompose} className="neo-icon-button">
              <Pencil size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
          {onFilterClick && (
            <button type="button" aria-label="Lọc danh mục" onClick={onFilterClick} className="neo-icon-button">
              <SlidersHorizontal size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {searchOpen && (<>
        <form className="mb-2 flex min-h-11 items-center gap-2 px-4" role="search"
          onSubmit={event => { event.preventDefault(); onSearch(query) }}>
          <input
            ref={input} type="search" aria-label="Tìm kiếm email" placeholder="Tìm thư hoặc tên tệp" maxLength={200}
            className="h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--input-border)] px-3 text-base"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') closeSearch() }}
          />
          <button type="submit" aria-label="Tìm trong hộp thư" className="neo-icon-button">
            <Search size={20} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Đóng tìm kiếm" onClick={closeSearch} className="neo-icon-button">
            <X size={20} aria-hidden="true" />
          </button>
        </form>
        <Link href={query.trim() ? "/search?q=" + encodeURIComponent(query.trim()) : "/search"}
          className="neo-target mx-4 mb-2 inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-foreground)] underline">
          Mở Ask Inbox
        </Link>
      </>)}

      <div role="group" aria-label="Lọc hộp thư" className="flex gap-4 overflow-x-auto px-4">
        {segments.map(segment => {
          const count = segment.id === 'unread' ? unreadCount : segment.id === 'important' ? importantCount : 0
          return (
            <button
              type="button" key={segment.id} aria-pressed={currentSegment === segment.id}
              onClick={() => onSegmentChange(segment.id)}
              className="neo-nav-item neo-nav-inline neo-target shrink-0 gap-1 whitespace-nowrap text-xs"
            >
              {segment.label}
              {count > 0 && <span className="tabular-nums">{count > 99 ? '99+' : count}</span>}
            </button>
          )
        })}
      </div>
    </header>
  )
})

export default MobileInboxHeader
