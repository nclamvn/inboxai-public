'use client';

/**
 * Category Filter Sheet - Mobile
 * Bottom sheet for full category selection
 */

import { mailCategoryLabels } from '@/components/email/mail-category-label';
import { mailSignal } from '@/components/email/mail-signal';
import { memo } from 'react';
import {
  Inbox,
  ListTodo,
  Check,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';

const CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'needs_action', label: 'Cần xử lý' },
  ...(['work','personal','transaction','newsletter','promotion','social','spam'] as const).map(id => ({ id, label: mailCategoryLabels[id] })),
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
        {CATEGORIES.map(({ id, label }) => {
          const { tone, Icon } = id==='all' ? { tone:'work', Icon:Inbox }
            : id==='needs_action' ? { tone:'important', Icon:ListTodo } : mailSignal(id)
          return (
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
            <span className="neo-signal-heading" data-mail-tone={tone} aria-hidden="true"><Icon size={16} strokeWidth={1.8} /></span>
            <span className="flex-1">{label}</span>
            <span className="tabular-nums text-[var(--foreground-muted)]">{emailCounts[id] || ''}</span>
            {currentCategory === id && <Check size={16} aria-hidden="true" />}
          </button>
        )})}
      </div>
    </Modal>
  );
});

export default CategoryFilterSheet;
