'use client'

import { Star, Paperclip, AlertCircle } from 'lucide-react'
import { cn, formatDate, truncate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Email } from '@/types'

interface EmailListProps {
  emails: Email[]
  selectedId?: string
  onSelect: (email: Email) => void
  onStar: (emailId: string) => void
}

const priorityColors: Record<number, string> = {
  1: 'bg-[#DC2626]',
  2: 'bg-[#D97706]',
  3: 'bg-[#1A1A1A]',
  4: 'bg-[#9B9B9B]',
  5: 'bg-[#D4D4D4]',
}

const categoryLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'urgent' | 'info' }> = {
  work: { label: 'Công việc', variant: 'info' },
  personal: { label: 'Cá nhân', variant: 'success' },
  newsletter: { label: 'Bản tin', variant: 'default' },
  promotion: { label: 'Khuyến mãi', variant: 'warning' },
  transaction: { label: 'Giao dịch', variant: 'urgent' },
  social: { label: 'Mạng XH', variant: 'secondary' },
}

export function EmailList({ emails, selectedId, onSelect, onStar }: EmailListProps) {
  if (emails.length === 0) {
    return null
  }

  return (
    <div className="divide-y divide-[#EBEBEB]">
      {emails.map((email) => {
        const categoryInfo = email.category ? categoryLabels[email.category] : null
        const isSelected = email.id === selectedId

        return (
          <div
            key={email.id}
            onClick={() => onSelect(email)}
            className={cn(
              'flex items-start gap-3 p-4 cursor-pointer transition-colors',
              isSelected ? 'bg-[#F5F5F5]' : email.is_read ? 'bg-white hover:bg-[#FAFAFA]' : 'bg-[#FAFAFA] hover:bg-[#F5F5F5]'
            )}
          >
            {/* Priority Indicator */}
            <div className={cn('w-1 h-14 rounded-full flex-shrink-0', priorityColors[email.priority || 3])} />

            {/* Star */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStar(email.id)
              }}
              className="flex-shrink-0 mt-0.5"
            >
              <Star
                className={cn(
                  'w-5 h-5 transition-colors',
                  email.is_starred ? 'fill-[#D97706] text-[#D97706]' : 'text-[#D4D4D4] hover:text-[#D97706]'
                )}
                strokeWidth={1.5}
              />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'text-[14px] truncate',
                  email.is_read ? 'text-[#6B6B6B]' : 'font-semibold text-[#1A1A1A]'
                )}>
                  {email.from_name || email.from_address}
                </span>
                {email.needs_reply && (
                  <span title="Cần trả lời">
                    <AlertCircle className="w-4 h-4 text-[#D97706] flex-shrink-0" strokeWidth={1.5} />
                  </span>
                )}
                {categoryInfo && (
                  <Badge variant={categoryInfo.variant} size="sm">
                    {categoryInfo.label}
                  </Badge>
                )}
              </div>
              <p className={cn(
                'text-[14px] truncate mb-1',
                email.is_read ? 'text-[#6B6B6B]' : 'font-medium text-[#1A1A1A]'
              )}>
                {email.subject || '(Không có tiêu đề)'}
              </p>
              <p className="text-[13px] text-[#9B9B9B] truncate">
                {email.summary || truncate(email.snippet || '', 80)}
              </p>
            </div>

            {/* Time */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[12px] text-[#9B9B9B]">
                {email.received_at ? formatDate(email.received_at) : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
