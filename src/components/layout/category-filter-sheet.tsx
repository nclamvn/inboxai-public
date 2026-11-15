'use client';

/**
 * Category Filter Sheet - Mobile
 * Bottom sheet for full category selection
 */

import { mailCategoryLabels } from '@/components/email/mail-category-label';
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
  { id: 'work', label: mailCategoryLabels.work, icon: Briefcase },
  { id: 'personal', label: mailCategoryLabels.personal, icon: User },
  { id: 'transaction', label: mailCategoryLabels.transaction, icon: CreditCard },
  { id: 'newsletter', label: mailCategoryLabels.newsletter, icon: Newspaper },
  { id: 'promotion', label: mailCategoryLabels.promotion, icon: Gift },
  { id: 'social', label: mailCategoryLabels.social, icon: Users },
  { id: 'spam', label: mailCategoryLabels.spam, icon: AlertOctagon },
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
