'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FollowUpCounts {
  total: number
  high: number
  medium: number
  low: number
}

interface Props {
  className?: string
  showLabel?: boolean
}

export function FollowUpBadge({ className, showLabel = false }: Props) {
  const [counts, setCounts] = useState<FollowUpCounts | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/follow-ups/counts')
        if (res.ok) {
          const data = await res.json()
          setCounts(data)
        }
      } catch {
        // Ignore errors
      }
    }

    fetchCounts()
    // Refresh every 10 minutes (was 5 minutes - performance optimization)
    const interval = setInterval(fetchCounts, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const handleClick = () => {
    router.push('/follow-ups')
  }

  if (!counts || counts.total === 0) {
    if (showLabel) {
      return (
        <button
          onClick={handleClick}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover)] transition-colors',
            className
          )}
        >
          <Clock className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[14px]">Follow-ups</span>
        </button>
      )
    }
    return null
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'relative p-2 transition-colors hover:text-[var(--foreground)]',
        counts.high > 0
          ? 'text-red-500 dark:text-red-400'
          : 'text-amber-500 dark:text-amber-400',
        className
      )}
    >
      <Clock className="w-5 h-5" strokeWidth={1.5} />
      {showLabel && <span className="text-[14px] ml-2">Follow-ups</span>}

      {/* Badge count */}
      <span className={cn(
        'absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white',
        counts.high > 0 ? 'bg-red-500' : 'bg-amber-500'
      )}>
        {counts.total > 99 ? '99+' : counts.total}
      </span>
    </button>
  )
}

// Simpler inline badge for sidebar
export function FollowUpInlineBadge() {
  const [counts, setCounts] = useState<FollowUpCounts | null>(null)

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/follow-ups/counts')
        if (res.ok) {
          const data = await res.json()
          setCounts(data)
        }
      } catch {
        // Ignore errors
      }
    }

    fetchCounts()
    // Refresh every 10 minutes (was 5 minutes - performance optimization)
    const interval = setInterval(fetchCounts, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!counts || counts.total === 0) {
    return null
  }

  return (
    <span className={cn(
      'flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-medium',
      counts.high > 0
        ? 'bg-red-500 text-white'
        : 'bg-amber-500 text-white'
    )}>
      {counts.total > 99 ? '99+' : counts.total}
    </span>
  )
}
