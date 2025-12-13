'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
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
    // Refresh every 5 minutes
    const interval = setInterval(fetchCounts, 5 * 60 * 1000)
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
          <Bell className="w-4 h-4" strokeWidth={1.5} />
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
        'relative flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
        counts.high > 0
          ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20'
          : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20',
        className
      )}
    >
      <Bell className="w-4 h-4" strokeWidth={1.5} />
      {showLabel && <span className="text-[14px]">Follow-ups</span>}

      {/* Badge count */}
      <span className={cn(
        'flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-medium',
        counts.high > 0
          ? 'bg-red-500 text-white'
          : 'bg-amber-500 text-white'
      )}>
        {counts.total > 99 ? '99+' : counts.total}
      </span>

      {/* Pulse animation for high priority */}
      {counts.high > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
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
    const interval = setInterval(fetchCounts, 5 * 60 * 1000)
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
