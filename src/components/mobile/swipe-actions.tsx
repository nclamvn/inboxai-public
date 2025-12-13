'use client'

import { useState, useRef, useCallback, ReactNode } from 'react'
import { Archive, Trash2, Star, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHaptic } from '@/hooks/use-haptic'

export type SwipeAction = 'archive' | 'delete' | 'star' | 'read'

interface Props {
  children: ReactNode
  onSwipeLeft?: (action: SwipeAction) => void
  onSwipeRight?: (action: SwipeAction) => void
  leftAction?: SwipeAction
  rightAction?: SwipeAction
  disabled?: boolean
  className?: string
}

const ACTION_THRESHOLD = 80
const FULL_SWIPE_THRESHOLD = 150

const actionConfig: Record<SwipeAction, { icon: typeof Archive; bg: string; label: string }> = {
  archive: { icon: Archive, bg: 'bg-blue-500', label: 'Archive' },
  delete: { icon: Trash2, bg: 'bg-red-500', label: 'Delete' },
  star: { icon: Star, bg: 'bg-amber-500', label: 'Star' },
  read: { icon: Mail, bg: 'bg-green-500', label: 'Read' },
}

export function SwipeActions({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction = 'archive',
  rightAction = 'delete',
  disabled,
  className,
}: Props) {
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const isHorizontal = useRef<boolean | null>(null)
  const { trigger } = useHaptic()
  const triggeredRef = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isHorizontal.current = null
    triggeredRef.current = false
    setSwiping(true)
  }, [disabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || !swiping) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const diffX = currentX - startX.current
    const diffY = currentY - startY.current

    // Determine direction on first significant move
    if (isHorizontal.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontal.current = Math.abs(diffX) > Math.abs(diffY)
      }
      return
    }

    // Only handle horizontal swipes
    if (!isHorizontal.current) return

    // Prevent vertical scroll
    e.preventDefault()

    // Apply resistance at edges
    let newOffset = diffX
    if ((diffX > 0 && !onSwipeRight) || (diffX < 0 && !onSwipeLeft)) {
      newOffset = diffX * 0.2
    }

    // Clamp offset
    newOffset = Math.max(-200, Math.min(200, newOffset))
    setOffset(newOffset)

    // Haptic when crossing threshold
    if (Math.abs(newOffset) >= ACTION_THRESHOLD && !triggeredRef.current) {
      trigger('medium')
      triggeredRef.current = true
    } else if (Math.abs(newOffset) < ACTION_THRESHOLD && triggeredRef.current) {
      triggeredRef.current = false
    }
  }, [disabled, swiping, onSwipeLeft, onSwipeRight, trigger])

  const handleTouchEnd = useCallback(() => {
    if (disabled) return
    setSwiping(false)
    isHorizontal.current = null

    // Check for action
    if (offset >= FULL_SWIPE_THRESHOLD && onSwipeRight) {
      trigger('success')
      onSwipeRight(rightAction)
    } else if (offset <= -FULL_SWIPE_THRESHOLD && onSwipeLeft) {
      trigger('success')
      onSwipeLeft(leftAction)
    }

    setOffset(0)
  }, [disabled, offset, onSwipeLeft, onSwipeRight, leftAction, rightAction, trigger])

  const leftConfig = actionConfig[leftAction]
  const rightConfig = actionConfig[rightAction]
  const LeftIcon = leftConfig.icon
  const RightIcon = rightConfig.icon

  const showLeftAction = offset < -20
  const showRightAction = offset > 20
  const leftProgress = Math.min(Math.abs(offset) / ACTION_THRESHOLD, 1)
  const rightProgress = Math.min(offset / ACTION_THRESHOLD, 1)

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Left action (swipe left reveals) */}
      {onSwipeLeft && (
        <div
          className={cn(
            'absolute inset-y-0 right-0 flex items-center justify-end px-6 transition-opacity',
            leftConfig.bg
          )}
          style={{
            width: Math.abs(offset),
            opacity: showLeftAction ? 1 : 0,
          }}
        >
          <LeftIcon
            className="w-6 h-6 text-white"
            style={{
              transform: `scale(${0.5 + leftProgress * 0.5})`,
              opacity: leftProgress,
            }}
          />
        </div>
      )}

      {/* Right action (swipe right reveals) */}
      {onSwipeRight && (
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex items-center justify-start px-6 transition-opacity',
            rightConfig.bg
          )}
          style={{
            width: offset,
            opacity: showRightAction ? 1 : 0,
          }}
        >
          <RightIcon
            className="w-6 h-6 text-white"
            style={{
              transform: `scale(${0.5 + rightProgress * 0.5})`,
              opacity: rightProgress,
            }}
          />
        </div>
      )}

      {/* Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? undefined : 'transform 0.2s ease-out',
        }}
        className="bg-[var(--card)]"
      >
        {children}
      </div>
    </div>
  )
}
