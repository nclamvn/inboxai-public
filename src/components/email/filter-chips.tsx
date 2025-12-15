'use client'

import { memo, useMemo, useCallback } from 'react'
import { X, Zap, Sparkles, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterOption {
  id: string
  label: string
  count: number
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  color?: string
  important?: boolean  // Categories quan trọng cần warning khi xóa
}

interface Props {
  activeFilter: string | null
  onFilterChange: (filter: string | null) => void
  counts: {
    all: number
    work: number
    personal: number
    transaction: number
    newsletter: number
    promotion: number
    social: number
    spam: number
    needsAction: number
  }
  onClassify?: () => void
  classifying?: boolean
  onDeleteAll?: (category: string) => void
  onReclassify?: (category: string) => void
  reclassifying?: boolean
}

export const FilterChips = memo(function FilterChips({ activeFilter, onFilterChange, counts, onClassify, classifying, onDeleteAll, onReclassify, reclassifying }: Props) {
  // Memoize filters array - important = true means show warning before delete
  const filters: FilterOption[] = useMemo(() => [
    { id: 'all', label: 'Tất cả', count: counts.all, important: true },
    { id: 'needsAction', label: 'Cần xử lý', count: counts.needsAction, icon: Zap, color: 'urgent', important: true },
    { id: 'work', label: 'Công việc', count: counts.work, color: 'blue', important: true },
    { id: 'personal', label: 'Cá nhân', count: counts.personal, color: 'green', important: true },
    { id: 'transaction', label: 'Giao dịch', count: counts.transaction, color: 'red', important: true },
    { id: 'newsletter', label: 'Newsletter', count: counts.newsletter, important: false },
    { id: 'promotion', label: 'Khuyến mãi', count: counts.promotion, color: 'amber', important: false },
    { id: 'social', label: 'Mạng XH', count: counts.social, color: 'violet', important: false },
    { id: 'spam', label: 'Spam', count: counts.spam, color: 'spam', important: false },
  ], [counts])

  // Get current filter info
  const currentFilter = useMemo(() =>
    filters.find(f => f.id === activeFilter),
    [filters, activeFilter]
  )

  // Memoize visible filters
  const visibleFilters = useMemo(() =>
    filters.filter(f => f.id === 'all' || f.count > 0),
    [filters]
  )

  // Memoize handlers
  const handleClearFilter = useCallback(() => onFilterChange(null), [onFilterChange])

  const getChipStyle = (filter: FilterOption, isActive: boolean) => {
    if (isActive) {
      // Active state - filled
      switch (filter.color) {
        case 'urgent': return 'bg-[var(--primary)] text-[var(--primary-foreground)]'
        case 'blue': return 'bg-blue-600 text-white'
        case 'green': return 'bg-green-600 text-white'
        case 'red': return 'bg-red-600 text-white'
        case 'amber': return 'bg-amber-600 text-white'
        case 'violet': return 'bg-violet-600 text-white'
        case 'spam': return 'bg-red-500 text-white'
        default: return 'bg-[var(--primary)] text-[var(--primary-foreground)]'
      }
    } else {
      // Inactive state - subtle
      if (filter.color === 'spam') {
        return 'bg-red-100 dark:bg-red-900/30 text-[var(--foreground)] hover:bg-red-200 dark:hover:bg-red-900/50'
      }
      return 'bg-[var(--secondary)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]'
    }
  }

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto scrollbar-hide">
      {/* AI Classify Button - First position */}
      {onClassify && (
        <button
          onClick={onClassify}
          disabled={classifying}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap',
            'bg-[var(--secondary)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]',
            classifying && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Sparkles className={cn('w-3.5 h-3.5', classifying && 'animate-pulse')} strokeWidth={1.5} />
          <span>{classifying ? 'Đang phân loại...' : 'Phân loại AI'}</span>
        </button>
      )}

      {/* Divider */}
      {onClassify && (
        <div className="w-px h-5 bg-[var(--border)] mx-1" />
      )}

      {visibleFilters.map((filter) => {
        const isActive = activeFilter === filter.id || (filter.id === 'all' && !activeFilter)
        const Icon = filter.icon

        return (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id === 'all' ? null : filter.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap',
              getChipStyle(filter, isActive)
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />}
            <span>{filter.label}</span>
            {filter.count > 0 && filter.id !== 'all' && (
              <span className={cn(
                'ml-0.5 text-[11px]',
                isActive ? 'opacity-80' : 'opacity-60'
              )}>
                {filter.count}
              </span>
            )}
          </button>
        )
      })}

      {/* Re-classify button - hiện khi xem Spam */}
      {activeFilter === 'spam' && counts.spam > 0 && onReclassify && (
        <button
          onClick={() => onReclassify('spam')}
          disabled={reclassifying}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ml-2',
            'bg-purple-100 dark:bg-purple-900/30 text-[var(--foreground)] hover:bg-purple-200 dark:hover:bg-purple-900/50',
            reclassifying && 'opacity-50 cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', reclassifying && 'animate-spin')} strokeWidth={1.5} />
          <span>{reclassifying ? 'Đang kiểm tra...' : 'Kiểm tra AI'}</span>
        </button>
      )}

      {/* Delete All button - hiện cho mọi category (trừ all và needsAction) */}
      {activeFilter && activeFilter !== 'all' && activeFilter !== 'needsAction' && currentFilter && currentFilter.count > 0 && onDeleteAll && (
        <button
          onClick={() => onDeleteAll(activeFilter)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ml-2',
            currentFilter.important
              ? 'bg-orange-100 dark:bg-orange-900/30 text-[var(--foreground)] hover:bg-orange-200 dark:hover:bg-orange-900/50'
              : 'bg-red-600 text-white hover:bg-red-700'
          )}
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>Xóa tất cả</span>
        </button>
      )}

      {/* Clear filter button */}
      {activeFilter && activeFilter !== 'all' && (
        <button
          onClick={handleClearFilter}
          className="p-1.5 rounded-full text-[var(--muted-foreground)] hover:text-[var(--muted)] hover:bg-[var(--secondary)] transition-colors ml-1"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
})
