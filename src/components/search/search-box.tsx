'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, Clock, Bookmark, User, FileText, Calendar,
  Star, Paperclip, Tag, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchSuggestion {
  type: 'operator' | 'recent' | 'saved'
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  text: string
  description?: string
  value: string
}

const OPERATORS: SearchSuggestion[] = [
  { type: 'operator', icon: User, text: 'from:', description: 'Tìm theo người gửi', value: 'from:' },
  { type: 'operator', icon: FileText, text: 'subject:', description: 'Tìm trong tiêu đề', value: 'subject:' },
  { type: 'operator', icon: Tag, text: 'category:', description: 'Theo phân loại (work, personal...)', value: 'category:' },
  { type: 'operator', icon: Calendar, text: 'after:', description: 'Sau ngày (2024/12/01)', value: 'after:' },
  { type: 'operator', icon: Calendar, text: 'before:', description: 'Trước ngày', value: 'before:' },
  { type: 'operator', icon: Star, text: 'is:starred', description: 'Email đã gắn sao', value: 'is:starred ' },
  { type: 'operator', icon: AlertCircle, text: 'is:unread', description: 'Email chưa đọc', value: 'is:unread ' },
  { type: 'operator', icon: Paperclip, text: 'has:attachment', description: 'Có file đính kèm', value: 'has:attachment ' },
]

interface Props {
  defaultValue?: string
  onSearch?: (query: string) => void
  autoFocus?: boolean
  className?: string
}

export function SearchBox({ defaultValue = '', onSearch, autoFocus = false, className }: Props) {
  const [query, setQuery] = useState(defaultValue)
  const [focused, setFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [savedSearches, setSavedSearches] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Fetch search history
  useEffect(() => {
    const fetchSearchHistory = async () => {
      try {
        const res = await fetch('/api/search/history')
        if (res.ok) {
          const data = await res.json()
          setRecentSearches(data.recent || [])
          setSavedSearches(data.saved || [])
        }
      } catch {
        console.error('Failed to fetch search history')
      }
    }
    fetchSearchHistory()
  }, [])

  // Update query when defaultValue changes
  useEffect(() => {
    setQuery(defaultValue)
  }, [defaultValue])

  // Get filtered suggestions
  const getSuggestions = useCallback((): SearchSuggestion[] => {
    const suggestions: SearchSuggestion[] = []
    const lowerQuery = query.toLowerCase()

    // If empty or just started typing, show operators
    if (!query || query.length < 2) {
      // Show matching operators
      const matchingOps = OPERATORS.filter(op =>
        op.text.toLowerCase().includes(lowerQuery) ||
        op.description?.toLowerCase().includes(lowerQuery)
      )
      suggestions.push(...matchingOps.slice(0, 4))

      // Show recent searches
      recentSearches.slice(0, 3).forEach(search => {
        suggestions.push({
          type: 'recent',
          icon: Clock,
          text: search,
          value: search
        })
      })

      // Show saved searches
      savedSearches.slice(0, 2).forEach(search => {
        suggestions.push({
          type: 'saved',
          icon: Bookmark,
          text: search,
          value: search
        })
      })
    } else {
      // Show matching operators
      const matchingOps = OPERATORS.filter(op =>
        op.text.toLowerCase().includes(lowerQuery)
      )
      suggestions.push(...matchingOps.slice(0, 3))

      // Show matching recent searches
      recentSearches
        .filter(s => s.toLowerCase().includes(lowerQuery))
        .slice(0, 3)
        .forEach(search => {
          suggestions.push({
            type: 'recent',
            icon: Clock,
            text: search,
            value: search
          })
        })
    }

    return suggestions
  }, [query, recentSearches, savedSearches])

  const suggestions = getSuggestions()

  // Handle search
  const handleSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return

    // Save to recent searches
    fetch('/api/search/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery.trim() })
    })

    setShowSuggestions(false)

    if (onSearch) {
      onSearch(searchQuery)
    } else {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }, [onSearch, router])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        const suggestion = suggestions[selectedIndex]
        if (suggestion.type === 'operator' && suggestion.value.endsWith(':')) {
          setQuery(prev => prev + suggestion.value)
        } else {
          setQuery(suggestion.value)
          handleSearch(suggestion.value)
        }
      } else {
        handleSearch(query)
      }
      setSelectedIndex(-1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      inputRef.current?.blur()
    }
  }

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'operator' && suggestion.value.endsWith(':')) {
      setQuery(prev => prev + suggestion.value)
      inputRef.current?.focus()
    } else {
      setQuery(suggestion.value)
      handleSearch(suggestion.value)
    }
  }

  return (
    <div className={cn('relative', className)}>
      {/* Search Input */}
      <div className={cn(
        'flex items-center gap-2 h-10 px-4 rounded-lg border transition-all',
        focused
          ? 'border-[var(--primary)] bg-[var(--card)] shadow-sm'
          : 'border-[var(--border)] bg-[var(--input)] hover:bg-[var(--secondary)]'
      )}>
        <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" strokeWidth={1.5} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowSuggestions(true)
            setSelectedIndex(-1)
          }}
          onFocus={() => {
            setFocused(true)
            setShowSuggestions(true)
          }}
          onBlur={() => {
            setFocused(false)
            // Delay hiding to allow clicks
            setTimeout(() => setShowSuggestions(false), 200)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Tìm kiếm email... (thử from: hoặc is:unread)"
          className="flex-1 bg-transparent text-[14px] text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none"
          autoFocus={autoFocus}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--muted)] transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-lg z-50 overflow-hidden">
          {/* Operators Section */}
          {suggestions.some(s => s.type === 'operator') && (
            <div className="p-2 border-b border-[var(--border)]">
              <p className="px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Toán tử tìm kiếm
              </p>
              {suggestions
                .filter(s => s.type === 'operator')
                .map((suggestion, index) => {
                  const Icon = suggestion.icon
                  return (
                    <button
                      key={suggestion.text}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors',
                        selectedIndex === index
                          ? 'bg-[var(--secondary)]'
                          : 'hover:bg-[var(--hover)]'
                      )}
                    >
                      <Icon className="w-4 h-4 text-[var(--muted)]" strokeWidth={1.5} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-medium text-[var(--foreground)]">
                          {suggestion.text}
                        </span>
                        {suggestion.description && (
                          <span className="text-[13px] text-[var(--muted-foreground)] ml-2">
                            {suggestion.description}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
            </div>
          )}

          {/* Recent Searches */}
          {suggestions.some(s => s.type === 'recent') && (
            <div className="p-2 border-b border-[var(--border)]">
              <p className="px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Tìm kiếm gần đây
              </p>
              {suggestions
                .filter(s => s.type === 'recent')
                .map((suggestion, index) => {
                  const actualIndex = suggestions.findIndex(s => s === suggestion)
                  return (
                    <button
                      key={`recent-${index}`}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors',
                        selectedIndex === actualIndex
                          ? 'bg-[var(--secondary)]'
                          : 'hover:bg-[var(--hover)]'
                      )}
                    >
                      <Clock className="w-4 h-4 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                      <span className="text-[14px] text-[var(--muted)]">
                        {suggestion.text}
                      </span>
                    </button>
                  )
                })}
            </div>
          )}

          {/* Saved Searches */}
          {suggestions.some(s => s.type === 'saved') && (
            <div className="p-2">
              <p className="px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Đã lưu
              </p>
              {suggestions
                .filter(s => s.type === 'saved')
                .map((suggestion, index) => {
                  const actualIndex = suggestions.findIndex(s => s === suggestion)
                  return (
                    <button
                      key={`saved-${index}`}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors',
                        selectedIndex === actualIndex
                          ? 'bg-[var(--secondary)]'
                          : 'hover:bg-[var(--hover)]'
                      )}
                    >
                      <Bookmark className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
                      <span className="text-[14px] text-[var(--muted)]">
                        {suggestion.text}
                      </span>
                    </button>
                  )
                })}
            </div>
          )}

          {/* Help text */}
          <div className="px-4 py-2 bg-[var(--background)] border-t border-[var(--border)]">
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Nhấn Enter để tìm · ↑↓ để chọn · Esc để đóng
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
