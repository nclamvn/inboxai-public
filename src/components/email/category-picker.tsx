'use client'

import {
  Briefcase, User, CreditCard, Newspaper,
  Megaphone, AlertTriangle, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CategoryPickerProps {
  onSelect: (category: string) => void
  onClose: () => void
  currentCategory?: string
}

const categories = [
  { id: 'work', label: 'Công việc', icon: Briefcase, color: 'text-blue-600 bg-blue-100 dark:bg-blue-500/20' },
  { id: 'personal', label: 'Cá nhân', icon: User, color: 'text-purple-600 bg-purple-100 dark:bg-purple-500/20' },
  { id: 'transaction', label: 'Giao dịch', icon: CreditCard, color: 'text-green-600 bg-green-100 dark:bg-green-500/20' },
  { id: 'newsletter', label: 'Newsletter', icon: Newspaper, color: 'text-gray-600 bg-gray-100 dark:bg-gray-500/20' },
  { id: 'promotion', label: 'Khuyến mãi', icon: Megaphone, color: 'text-orange-600 bg-orange-100 dark:bg-orange-500/20' },
  { id: 'spam', label: 'Spam', icon: AlertTriangle, color: 'text-red-600 bg-red-100 dark:bg-red-500/20' },
]

export function CategoryPicker({ onSelect, onClose, currentCategory }: CategoryPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Chọn nhãn</h3>
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Categories */}
        <div className="p-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                'text-left transition-colors',
                currentCategory === cat.id
                  ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'hover:bg-[var(--secondary)] text-[var(--foreground)]'
              )}
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', cat.color)}>
                <cat.icon className="w-4 h-4" />
              </div>
              <span className="font-medium">{cat.label}</span>
              {currentCategory === cat.id && (
                <span className="ml-auto text-xs text-[var(--primary)]">Hiện tại</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
