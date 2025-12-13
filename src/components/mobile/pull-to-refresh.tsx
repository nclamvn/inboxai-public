'use client'

import { useState, useRef, useCallback, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHaptic } from '@/hooks/use-haptic'

interface Props {
  onRefresh: () => Promise<void>
  children: ReactNode
  className?: string
  disabled?: boolean
}

const THRESHOLD = 80
const MAX_PULL = 120

export function PullToRefresh({ onRefresh, children, className, disabled }: Props) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const { trigger } = useHaptic()

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY
    }
  }, [disabled, isRefreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing || startY.current === 0) return
    if (containerRef.current && containerRef.current.scrollTop > 0) {
      startY.current = 0
      setPullDistance(0)
      return
    }

    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current

    if (diff > 0) {
      // Apply resistance
      const resistance = 0.4
      const distance = Math.min(diff * resistance, MAX_PULL)
      setPullDistance(distance)

      // Haptic feedback when crossing threshold
      if (distance >= THRESHOLD && pullDistance < THRESHOLD) {
        trigger('medium')
      }
    }
  }, [disabled, isRefreshing, pullDistance, trigger])

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing) return
    startY.current = 0

    if (pullDistance >= THRESHOLD) {
      setIsRefreshing(true)
      trigger('success')

      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }

    setPullDistance(0)
  }, [disabled, isRefreshing, pullDistance, onRefresh, trigger])

  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const rotation = progress * 180

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center z-10 pointer-events-none transition-opacity"
        style={{
          top: -40,
          transform: `translateY(${pullDistance}px)`,
          opacity: pullDistance > 10 ? 1 : 0,
        }}
      >
        <div className={cn(
          'w-10 h-10 rounded-full bg-[var(--card)] shadow-lg flex items-center justify-center border border-[var(--border)]',
          isRefreshing && 'animate-pulse'
        )}>
          <RefreshCw
            className={cn(
              'w-5 h-5 text-[var(--muted-foreground)] transition-transform',
              isRefreshing && 'animate-spin'
            )}
            style={{ transform: isRefreshing ? undefined : `rotate(${rotation}deg)` }}
            strokeWidth={2}
          />
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="h-full overflow-auto"
        style={{
          transform: `translateY(${isRefreshing ? 50 : pullDistance}px)`,
          transition: pullDistance === 0 && !isRefreshing ? 'transform 0.2s ease-out' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}
