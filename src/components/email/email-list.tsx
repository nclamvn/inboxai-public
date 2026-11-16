'use client'

import { Star, AlertCircle } from 'lucide-react'
import { useId } from 'react'
import { cn, formatDate, truncate } from '@/lib/utils'
import { useOptionalSelection } from '@/contexts/email-selection-context'
import type { Email } from '@/types'
import { getMailCategoryLabel, MailCategoryLabel } from './mail-category-label'
import { MailSignal, mailSignal } from './mail-signal'

interface EmailListProps {
  emails: Email[]
  selectedId?: string
  onSelect: (email: Email) => void
  onStar: (emailId: string) => void
  selectable?: boolean
}

export function EmailList({ emails, selectedId, onSelect, onStar, selectable }: EmailListProps) {
  const selection = useOptionalSelection()
  const labelPrefix = useId()
  if (emails.length === 0) {
    return null
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {emails.map((email) => {
        const subject = email.subject || '(Không có tiêu đề)'
        const categoryLabel = getMailCategoryLabel(email.category)
        const isSelected = email.id === selectedId

        return (
          <div
            key={email.id}
            data-mail-tone={mailSignal(email.category).tone}
            data-active={isSelected}
            onClick={() => onSelect(email)}
            className={cn(
              'neo-mail-row flex items-start gap-3 p-4 cursor-pointer transition-colors',
              isSelected
                ? 'bg-[var(--secondary)]'
                : email.is_read
                  ? 'bg-[var(--card)] hover:bg-[var(--hover)]'
                  : 'bg-[var(--background)] hover:bg-[var(--secondary)]'
            )}
          >
            {selectable && selection && <label className="flex min-h-11 shrink-0 items-center px-1" onClick={event => event.stopPropagation()}>
              <input type="checkbox" className="focus-ring size-4"
                aria-label={`Chọn thư: ${email.subject || '(Không có tiêu đề)'}`}
                checked={selection.isSelected(email.id)} onChange={() => selection.toggleSelect(email.id)} />
            </label>}
            {/* Star */}
            <button
              type="button"
              aria-label={email.is_starred ? 'Bỏ gắn sao' : 'Gắn sao'}
              aria-pressed={email.is_starred}
              onClick={(e) => {
                e.stopPropagation()
                onStar(email.id)
              }}
              className="neo-icon-button shrink-0"
            >
              <Star
                className={cn(
                  'w-5 h-5 transition-colors',
                  email.is_starred ? 'fill-amber-500 text-amber-500' : 'text-gray-500 dark:text-gray-400 hover:text-amber-400'
                )}
                strokeWidth={1.5}
              />
            </button>

            <MailSignal category={email.category} />
            {/* Content */}
            <button type="button" aria-label={subject} aria-describedby={categoryLabel ? labelPrefix+email.id : undefined}
              className="focus-ring min-h-11 min-w-0 flex-1 text-start">
              <span className="mb-1 flex items-center gap-2">
                <span className={cn(
                  'text-[14px] truncate',
                  email.is_read ? 'text-[var(--muted)]' : 'font-semibold text-[var(--foreground)]'
                )}>
                  {email.from_name || email.from_address}
                </span>
                {email.needs_reply && (
                  <span title="Cần trả lời">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" strokeWidth={1.5} />
                  </span>
                )}
              </span>
              <span className={cn(
                'mb-1 block truncate text-[14px]',
                email.is_read ? 'text-[var(--muted)]' : 'font-medium text-[var(--foreground)]'
              )}>
                {subject}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <MailCategoryLabel category={email.category} id={labelPrefix+email.id} />
                <span className="min-w-0 basis-20 flex-1 truncate text-[13px] text-[var(--muted-foreground)]">
                  {email.summary || truncate(email.snippet || '', 80)}
                </span>
              </span>
            </button>

            {/* Time */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[12px] text-[var(--muted-foreground)]">
                {email.received_at ? formatDate(email.received_at) : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
