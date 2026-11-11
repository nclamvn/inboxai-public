'use client';

/**
 * Category Filter Sheet - Mobile
 * Bottom sheet for full category selection
 */

import { memo } from 'react';
import {
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
import { Modal } from '@/components/ui/modal';

const CATEGORIES = [
  { id: 'all', label: 'Tất cả', icon: Inbox },
  { id: 'needs_action', label: 'Cần xử lý', icon: Zap },
  { id: 'work', label: 'Công việc', icon: Briefcase },
  { id: 'personal', label: 'Cá nhân', icon: User },
  { id: 'transaction', label: 'Giao dịch', icon: CreditCard },
  { id: 'newsletter', label: 'Newsletter', icon: Newspaper },
  { id: 'promotion', label: 'Khuyến mãi', icon: Gift },
  { id: 'social', label: 'Mạng XH', icon: Users },
  { id: 'spam', label: 'Spam', icon: AlertOctagon },
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
  return (
    <Modal open={isOpen} onClose={onClose} title="Lọc theo danh mục">
      <div className="divide-y divide-[var(--border)]">
        {CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-pressed={currentCategory === id}
            onClick={() => {
              onCategoryChange(id);
              onClose();
            }}
            className="neo-nav-item neo-target w-full px-3 py-2 text-start text-sm"
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            <span className="tabular-nums text-[var(--foreground-muted)]">{emailCounts[id] || ''}</span>
            {currentCategory === id && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </Modal>
  );
});

export default CategoryFilterSheet;
