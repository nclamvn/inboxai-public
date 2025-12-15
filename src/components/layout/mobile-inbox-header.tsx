'use client';

/**
 * Mobile Inbox Header - Apple Style
 * Clean header + segmented control
 */

import { memo, useState, useCallback } from 'react';
import {
  Search,
  Edit,
  SlidersHorizontal,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/theme-context';

// Segments for quick filter
const SEGMENTS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'important', label: 'Quan trọng' },
];

interface MobileInboxHeaderProps {
  currentSegment: string;
  onSegmentChange: (segment: string) => void;
  unreadCount: number;
  importantCount: number;
  onSearch: (query: string) => void;
  onCompose?: () => void;
  onFilterClick?: () => void;
  title?: string;
  className?: string;
}

export const MobileInboxHeader = memo(function MobileInboxHeader({
  currentSegment,
  onSegmentChange,
  unreadCount,
  importantCount,
  onSearch,
  onCompose,
  onFilterClick,
  title = 'Hộp thư',
  className,
}: MobileInboxHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen(!isSearchOpen);
    if (isSearchOpen) {
      setSearchQuery('');
      onSearch('');
    }
  }, [isSearchOpen, onSearch]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch(value);
  }, [onSearch]);

  // Get count for segment
  const getSegmentCount = useCallback((segmentId: string) => {
    switch (segmentId) {
      case 'unread': return unreadCount;
      case 'important': return importantCount;
      default: return 0;
    }
  }, [unreadCount, importantCount]);

  return (
    <div className={cn('bg-[var(--card)]', className)}>
      {/* Main Header */}
      <div className="flex items-center justify-between px-4 py-3">
        {isSearchOpen ? (
          // Search Mode
          <div className="flex-1 flex items-center gap-3">
            <button
              onClick={handleSearchToggle}
              className="p-1 text-blue-500"
            >
              <X className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Tìm kiếm..."
              autoFocus
              className="flex-1 bg-transparent text-base text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none"
            />
          </div>
        ) : (
          // Normal Mode
          <>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {title}
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSearchToggle}
                className="p-2 hover:bg-[var(--hover)] rounded-full transition-colors"
              >
                <Search className="w-5 h-5 text-blue-500" />
              </button>
              {/* Theme Toggle - Show current theme icon */}
              <button
                onClick={toggleTheme}
                className="p-2 hover:bg-[var(--hover)] rounded-full transition-colors"
              >
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-[var(--foreground-muted)]" />
                ) : (
                  <Sun className="w-5 h-5 text-amber-500" />
                )}
              </button>
              <button
                onClick={onCompose}
                className="p-2 hover:bg-[var(--hover)] rounded-full transition-colors"
              >
                <Edit className="w-5 h-5 text-blue-500" />
              </button>
              <button
                onClick={onFilterClick}
                className="p-2 hover:bg-[var(--hover)] rounded-full transition-colors"
              >
                <SlidersHorizontal className="w-5 h-5 text-[var(--foreground-muted)]" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Segmented Control - Apple Style */}
      {!isSearchOpen && (
        <div className="px-4 pb-3">
          <div className="flex p-1 bg-[var(--secondary)] rounded-xl">
            {SEGMENTS.map((segment) => {
              const count = getSegmentCount(segment.id);
              const isActive = currentSegment === segment.id;

              return (
                <button
                  key={segment.id}
                  onClick={() => onSegmentChange(segment.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  <span>{segment.label}</span>
                  {count > 0 && (
                    <span className={cn(
                      'min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-xs font-semibold',
                      isActive
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    )}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export default MobileInboxHeader;
