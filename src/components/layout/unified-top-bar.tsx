'use client';

/**
 * Unified Top Bar - Desktop
 * Single bar with search + filter dropdown
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  Menu,
  ChevronDown,
  Check,
  Inbox,
  Zap,
  Briefcase,
  User,
  CreditCard,
  Newspaper,
  Gift,
  Users,
  AlertOctagon,
  X,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { NotificationDropdown } from '@/components/notifications/notification-dropdown';
import { useTheme } from '@/contexts/theme-context';

// Category definitions
const CATEGORIES = [
  { id: 'all', label: 'Tất cả', icon: Inbox, color: 'text-gray-600 dark:text-gray-400' },
  { id: 'needs_action', label: 'Cần xử lý', icon: Zap, color: 'text-red-500', dividerAfter: true },
  { id: 'work', label: 'Công việc', icon: Briefcase, color: 'text-blue-500' },
  { id: 'personal', label: 'Cá nhân', icon: User, color: 'text-purple-500' },
  { id: 'transaction', label: 'Giao dịch', icon: CreditCard, color: 'text-green-500' },
  { id: 'newsletter', label: 'Newsletter', icon: Newspaper, color: 'text-gray-500' },
  { id: 'promotion', label: 'Khuyến mãi', icon: Gift, color: 'text-orange-500' },
  { id: 'social', label: 'Mạng XH', icon: Users, color: 'text-cyan-500', dividerAfter: true },
  { id: 'spam', label: 'Spam', icon: AlertOctagon, color: 'text-red-400' },
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
  totalEmails: number;
  onSearch: (query: string) => void;
  onMenuClick?: () => void;
  onProfileClick?: () => void;
  className?: string;
}

export const UnifiedTopBar = memo(function UnifiedTopBar({
  currentFilter,
  onFilterChange,
  emailCounts,
  totalEmails,
  onSearch,
  onMenuClick,
  onProfileClick,
  className,
}: UnifiedTopBarProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
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
    onSearch('');
    searchInputRef.current?.focus();
  }, [onSearch]);

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
      'flex items-center gap-3 px-4 py-2.5 bg-[var(--card)] border-b border-[var(--border)]',
      className
    )}>
      {/* Menu Button */}
      <button
        onClick={onMenuClick}
        className="p-2 hover:bg-[var(--hover)] rounded-lg transition-colors lg:hidden"
      >
        <Menu className="w-5 h-5 text-[var(--foreground-muted)]" />
      </button>

      {/* Search Bar */}
      <form
        onSubmit={handleSearchSubmit}
        className={cn(
          'flex-1 flex items-center gap-2 px-3 py-2 rounded-xl transition-all',
          'bg-[var(--secondary)]',
          isSearchFocused && 'ring-2 ring-blue-500 bg-[var(--card)]'
        )}
      >
        <Search className="w-4 h-4 text-[var(--foreground-muted)] flex-shrink-0" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          placeholder="Tìm kiếm email... (⌘K)"
          className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleSearchClear}
            className="p-1 hover:bg-[var(--hover)] rounded-full transition-colors"
          >
            <X className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
          </button>
        )}
      </form>

      {/* Filter Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl transition-all',
            'hover:bg-[var(--hover)]',
            isDropdownOpen && 'bg-[var(--hover)]'
          )}
        >
          <currentCategory.icon className={cn('w-4 h-4', currentCategory.color)} />
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
            'bg-[var(--card)] rounded-xl shadow-xl',
            'border border-[var(--border)]',
            'animate-in fade-in slide-in-from-top-2 duration-200'
          )}>
            {CATEGORIES.map((category) => (
              <div key={category.id}>
                <button
                  onClick={() => handleFilterSelect(category.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    'hover:bg-[var(--hover)]',
                    currentFilter === category.id && 'bg-[var(--accent)]'
                  )}
                >
                  <category.icon className={cn('w-4 h-4', category.color)} />
                  <span className="flex-1 text-sm font-medium text-[var(--foreground)]">
                    {category.label}
                  </span>
                  {emailCounts[category.id] !== undefined && emailCounts[category.id] > 0 && (
                    <span className="text-xs text-[var(--foreground-muted)] tabular-nums">
                      {emailCounts[category.id]}
                    </span>
                  )}
                  {currentFilter === category.id && (
                    <Check className="w-4 h-4 text-blue-500" />
                  )}
                </button>
                {category.dividerAfter && (
                  <div className="my-1 border-t border-[var(--border)]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Theme Toggle - Show current theme icon */}
      <button
        type="button"
        onClick={toggleTheme}
        className="p-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        title={theme === 'dark' ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
      >
        {theme === 'dark' ? (
          <Moon className="w-5 h-5" />
        ) : (
          <Sun className="w-5 h-5" />
        )}
      </button>

      {/* AI Assistant Button */}
      <div className="relative" ref={aiPopoverRef}>
        <button
          type="button"
          onClick={() => setShowAIPopover(!showAIPopover)}
          className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-[var(--foreground)] transition-colors"
        >
          <Sparkles className="w-5 h-5" strokeWidth={1.5} />
          {briefing && briefing.needsAttention > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
              {briefing.needsAttention}
            </span>
          )}
        </button>

        {/* AI Popover */}
        {showAIPopover && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--secondary)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--foreground)]" strokeWidth={1.5} />
                  <span className="text-[14px] font-medium text-[var(--foreground)]">
                    AI Thư Ký
                  </span>
                </div>
                <button
                  type="button"
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
                        item.type === 'urgent' && 'text-red-500 dark:text-red-400',
                        item.type === 'deadline' && 'text-amber-500 dark:text-amber-400',
                        item.type === 'waiting' && 'text-blue-500 dark:text-blue-400',
                        item.type === 'vip' && 'text-violet-500 dark:text-violet-400',
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
                Xem Insights →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notification Dropdown */}
      <NotificationDropdown />

      {/* Profile */}
      <button
        onClick={onProfileClick}
        className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"
      >
        <span className="text-xs font-semibold text-white">U</span>
      </button>
    </div>
  );
});

export default UnifiedTopBar;
