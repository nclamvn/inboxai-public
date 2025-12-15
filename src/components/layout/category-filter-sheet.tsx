'use client';

/**
 * Category Filter Sheet - Mobile
 * Bottom sheet for full category selection
 */

import { memo, useEffect, useCallback } from 'react';
import {
  X,
  Inbox,
  Zap,
  Briefcase,
  User,
  CreditCard,
  Newspaper,
  Gift,
  Users,
  AlertOctagon,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { id: 'all', label: 'Tất cả', icon: Inbox, color: 'text-gray-600 dark:text-gray-400' },
  { id: 'needs_action', label: 'Cần xử lý', icon: Zap, color: 'text-red-500' },
  { id: 'work', label: 'Công việc', icon: Briefcase, color: 'text-blue-500' },
  { id: 'personal', label: 'Cá nhân', icon: User, color: 'text-purple-500' },
  { id: 'transaction', label: 'Giao dịch', icon: CreditCard, color: 'text-green-500' },
  { id: 'newsletter', label: 'Newsletter', icon: Newspaper, color: 'text-gray-500' },
  { id: 'promotion', label: 'Khuyến mãi', icon: Gift, color: 'text-orange-500' },
  { id: 'social', label: 'Mạng XH', icon: Users, color: 'text-cyan-500' },
  { id: 'spam', label: 'Spam', icon: AlertOctagon, color: 'text-red-400' },
];

interface CategoryFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentCategory: string;
  onCategoryChange: (category: string) => void;
  emailCounts: Record<string, number>;
}

export const CategoryFilterSheet = memo(function CategoryFilterSheet({
  isOpen,
  onClose,
  currentCategory,
  onCategoryChange,
  emailCounts,
}: CategoryFilterSheetProps) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle category select
  const handleSelect = useCallback((categoryId: string) => {
    onCategoryChange(categoryId);
    onClose();
  }, [onCategoryChange, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className={cn(
        'fixed inset-x-0 bottom-0 z-50',
        'bg-[var(--card)] rounded-t-3xl',
        'animate-in slide-in-from-bottom duration-300',
        'max-h-[80vh] overflow-hidden flex flex-col'
      )}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-[var(--border-strong)] rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">
            Lọc theo danh mục
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--hover)] rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-[var(--foreground-muted)]" />
          </button>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto py-2 pb-0">
          {CATEGORIES.map((category) => {
            const isActive = currentCategory === category.id;
            const count = emailCounts[category.id] || 0;

            return (
              <button
                key={category.id}
                onClick={() => handleSelect(category.id)}
                className={cn(
                  'w-full flex items-center gap-4 px-4 py-4 transition-colors',
                  'active:bg-[var(--hover)]',
                  isActive && 'bg-[var(--accent)]'
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  isActive ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-[var(--secondary)]'
                )}>
                  <category.icon className={cn('w-5 h-5', category.color)} />
                </div>
                <span className="flex-1 text-left text-base text-[var(--foreground)]">
                  {category.label}
                </span>
                {count > 0 && (
                  <span className="text-sm text-[var(--foreground-muted)] tabular-nums">
                    {count}
                  </span>
                )}
                {isActive && (
                  <Check className="w-5 h-5 text-blue-500" />
                )}
              </button>
            );
          })}

          {/* Safe area padding - inside scrollable for proper spacing */}
          <div className="h-[calc(2rem+env(safe-area-inset-bottom,0px))]" />
        </div>
      </div>
    </>
  );
});

export default CategoryFilterSheet;
