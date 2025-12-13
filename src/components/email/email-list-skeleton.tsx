'use client'

import { cn } from '@/lib/utils'

interface Props {
  count?: number
  compact?: boolean
}

export function EmailListSkeleton({ count = 8, compact = false }: Props) {
  return (
    <div className="animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'border-b border-[var(--border)]',
            compact ? 'px-3 py-2.5' : 'px-4 py-3'
          )}
        >
          <div className="flex items-start gap-3">
            {/* Star placeholder */}
            <div className="w-4 h-4 rounded bg-[var(--secondary)] flex-shrink-0 mt-0.5" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Sender + Time */}
              <div className="flex items-center justify-between gap-2">
                <div className="h-4 bg-[var(--secondary)] rounded w-32" />
                <div className="h-3 bg-[var(--secondary)] rounded w-12 flex-shrink-0" />
              </div>

              {/* Row 2: Subject */}
              <div className="h-4 bg-[var(--secondary)] rounded w-3/4 mt-1.5" />

              {/* Row 3: Preview (only in full mode) */}
              {!compact && (
                <div className="h-3 bg-[var(--secondary)] rounded w-full mt-1.5" />
              )}
            </div>

            {/* Category tag placeholder */}
            <div className="h-5 bg-[var(--secondary)] rounded w-16 flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  )
}
