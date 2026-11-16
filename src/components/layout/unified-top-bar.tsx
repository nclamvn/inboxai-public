'use client';

/**
 * Unified Top Bar - Desktop
 * Single bar with search + filter dropdown
 */

import { mailCategoryLabels } from '@/components/email/mail-category-label';
import { mailSignal } from '@/components/email/mail-signal';
import { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  Check,
  Inbox,
  ListTodo,
  X,
  ClipboardList,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/theme-toggle';

// Category definitions
const CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'needs_action', label: 'Cần xử lý', dividerAfter: true },
  { id: 'work', label: mailCategoryLabels.work },
  { id: 'personal', label: mailCategoryLabels.personal },
  { id: 'transaction', label: mailCategoryLabels.transaction },
  { id: 'newsletter', label: mailCategoryLabels.newsletter },
  { id: 'promotion', label: mailCategoryLabels.promotion },
  { id: 'social', label: mailCategoryLabels.social, dividerAfter: true },
  { id: 'spam', label: mailCategoryLabels.spam },
];

interface BriefingItem {
  type: string;
  title: string;
  count: number;
  emailIds?: string[];
}

interface BriefingData {
  unread: number;
  needsAttention: number;
  items: BriefingItem[];
}

interface UnifiedTopBarProps {
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  emailCounts: Record<string, number>;
  onSearch: (query: string) => void;
  onProfileClick?: () => void;
  className?: string;
  noBorder?: boolean;
}

export const UnifiedTopBar = memo(function UnifiedTopBar({
  currentFilter,
  onFilterChange,
  emailCounts,
  onSearch,
  onProfileClick,
  className,
  noBorder,
}: UnifiedTopBarProps) {
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAIPopover, setShowAIPopover] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const aiPopoverRef = useRef<HTMLDivElement>(null);

  // Get current category info
  const currentCategory = CATEGORIES.find(c => c.id === currentFilter) || CATEGORIES[0];
  const { tone: filterTone, Icon: FilterIcon } = currentCategory.id==='all' ? { tone:'work', Icon:Inbox }
    : currentCategory.id==='needs_action' ? { tone:'important', Icon:ListTodo } : mailSignal(currentCategory.id);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (aiPopoverRef.current && !aiPopoverRef.current.contains(event.target as Node)) {
        setShowAIPopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch AI briefing data
  useEffect(() => {
    const fetchBriefing = async () => {
      try {
        const res = await fetch('/api/ai/briefing');
        if (res.ok) {
          const data = await res.json();
          setBriefing({
            unread: data.summary?.unread || 0,
            needsAttention: data.briefingItems?.length || 0,
            items: data.briefingItems || []
          });
        }
      } catch {
        console.error('Failed to fetch briefing');
      }
    };

    fetchBriefing();
    // Refresh every 5 minutes
    const interval = setInterval(fetchBriefing, 300000);
    return () => clearInterval(interval);
  }, []);

  // Handle navigate to inbox with filter
  const handleNavigateToInbox = useCallback((item?: BriefingItem) => {
    setShowAIPopover(false);
    if (item?.emailIds && item.emailIds.length > 0) {
      sessionStorage.setItem('briefing_filter', JSON.stringify({
        type: item.type,
        title: item.title,
        emailIds: item.emailIds
      }));
      router.push(`/inbox?briefing=${item.type}`);
    }
  }, [router]);

  // Handle filter select
  const handleFilterSelect = useCallback((filterId: string) => {
    onFilterChange(filterId);
    setIsDropdownOpen(false);
  }, [onFilterChange]);

  // Handle search
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  }, [onSearch, searchQuery]);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear/blur search
      if (e.key === 'Escape') {
        if (isSearchFocused) {
          searchInputRef.current?.blur();
          setIsSearchFocused(false);
        }
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSearchFocused]);

  return (
    <div className={cn(
      'flex min-w-0 items-center gap-2 px-4 py-2 bg-[var(--surface)]',
      !noBorder && 'border-b border-[var(--border)]',
      className
    )}>
      {/* Search Bar */}
      <form
        onSubmit={handleSearchSubmit} role="search"
        className={cn(
          'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3',
          'focus-within:outline-2 focus-within:outline-[var(--focus-ring)]'
        )}
      >
        <button type="submit" aria-label="Tìm trong hộp thư" className="neo-target shrink-0 py-2 text-[var(--accent-foreground)]">
          <Search size={16} aria-hidden="true" />
        </button>
        <input
          ref={searchInputRef}
          type="search"
          aria-label="Tìm kiếm email"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          placeholder="Tìm thư hoặc tên tệp"
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleSearchClear}
            aria-label="Xóa tìm kiếm"
            className="p-1 hover:bg-[var(--hover)] rounded-full transition-colors"
          >
            <X className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
          </button>
        )}
      </form>

      {/* Filter Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          aria-label="Lọc danh mục"
          aria-expanded={isDropdownOpen}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={cn(
            'neo-target flex h-10 items-center gap-2 rounded-[var(--radius-control)] px-3',
            'hover:bg-[var(--hover)]',
            isDropdownOpen && 'bg-[var(--hover)]'
          )}
        >
          <span className="neo-signal-heading" data-mail-tone={filterTone} aria-hidden="true"><FilterIcon size={16} strokeWidth={1.8} /></span>
          <span className="text-sm font-semibold text-[var(--foreground)] hidden sm:inline">
            {currentCategory.label}
          </span>
          <ChevronDown className={cn(
            'w-4 h-4 text-[var(--foreground-muted)] transition-transform',
            isDropdownOpen && 'rotate-180'
          )} />
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div className={cn(
            'absolute right-0 top-full mt-2 w-56 py-2 z-50',
            'bg-[var(--card)] rounded-[var(--radius-panel)]',
            'border border-[var(--border)]',
            'animate-in fade-in slide-in-from-top-2 duration-200'
          )}>
            {CATEGORIES.map((category) => {
              const { tone, Icon } = category.id==='all' ? { tone:'work', Icon:Inbox }
                : category.id==='needs_action' ? { tone:'important', Icon:ListTodo } : mailSignal(category.id)
              return (
              <div key={category.id}>
                <button
                  type="button"
                  aria-pressed={currentFilter === category.id}
                  onClick={() => handleFilterSelect(category.id)}
                  className={cn(
                    'neo-nav-item neo-target w-full px-4 py-2 text-left',
                    'hover:bg-[var(--hover)]',
                    currentFilter === category.id && 'bg-[var(--accent)]'
                  )}
                >
                  <span className="neo-signal-heading" data-mail-tone={tone} aria-hidden="true"><Icon size={16} strokeWidth={1.8} /></span>
                  <span className="flex-1 text-sm font-medium text-[var(--foreground)]">
                    {category.label}
                  </span>
                  {emailCounts[category.id] !== undefined && emailCounts[category.id] > 0 && (
                    <span className="text-xs text-[var(--foreground-muted)] tabular-nums">
                      {emailCounts[category.id]}
                    </span>
                  )}
                  {currentFilter === category.id && (
                    <Check className="w-4 h-4 text-[var(--accent-foreground)]" />
                  )}
                </button>
                {category.dividerAfter && (
                  <div className="my-1 border-t border-[var(--border)]" />
                )}
              </div>
            )})}
          </div>
        )}
      </div>

      <ThemeToggle />

      {/* AI Assistant Button */}
      <div className="relative" ref={aiPopoverRef}>
        <button
          type="button"
          aria-label="Bản tin hộp thư"
          aria-expanded={showAIPopover}
          onClick={() => setShowAIPopover(!showAIPopover)}
          className="neo-icon-button relative"
        >
          <ClipboardList className="w-5 h-5" strokeWidth={1.5} />
          {briefing && briefing.needsAttention > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-[var(--primary-foreground)] bg-[var(--primary)] rounded-full">
              {briefing.needsAttention}
            </span>
          )}
        </button>

        {/* AI Popover */}
        {showAIPopover && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--card)] rounded-[var(--radius-panel)] border border-[var(--border-strong)] z-50 overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--secondary)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-[var(--foreground)]" strokeWidth={1.5} />
                  <span className="text-[14px] font-medium text-[var(--foreground)]">
                    Bản tin hộp thư
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Đóng bản tin"
                  onClick={() => setShowAIPopover(false)}
                  className="p-1 rounded text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
              {briefing && (
                <p className="text-[13px] text-[var(--foreground-muted)] mt-1">
                  {briefing.unread} chưa đọc · {briefing.needsAttention} cần chú ý
                </p>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {briefing?.items && briefing.items.length > 0 ? (
                <div className="p-2">
                  {briefing.items.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleNavigateToInbox(item)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--hover)] transition-colors text-left"
                    >
                      <span className={cn(
                        'text-[14px] font-bold',
                        item.type === 'urgent' && 'text-[var(--error)]',
                        item.type === 'deadline' && 'text-[var(--warning)]',
                        item.type === 'waiting' && 'text-[var(--accent-foreground)] dark:text-blue-400',
                        item.type === 'vip' && 'text-[var(--accent-foreground)]',
                        !['urgent', 'deadline', 'waiting', 'vip'].includes(item.type) && 'text-gray-500 dark:text-gray-400'
                      )}>
                        {item.count}
                      </span>
                      <span className="text-[14px] text-[var(--foreground)]">
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-[var(--foreground-muted)]">
                  <p className="text-[14px]">Không có gì cần chú ý</p>
                </div>
              )}
            </div>
            <div className="p-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setShowAIPopover(false);
                  router.push('/insights');
                }}
                className="block w-full text-center py-2 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Xem phân tích
              </button>
            </div>
          </div>
        )}
      </div>

      <button type="button" aria-label="Cài đặt" onClick={onProfileClick} className="neo-icon-button">
        <Settings size={20} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
});

export default UnifiedTopBar;
