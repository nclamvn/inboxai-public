'use client'

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHaptic } from '@/hooks/use-haptic'

interface Props {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  snapPoints?: number[]
  defaultSnap?: number
  className?: string
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = [0.5, 0.9],
  defaultSnap = 0,
  className,
}: Props) {
  const [currentSnap, setCurrentSnap] = useState(defaultSnap)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const { trigger } = useHaptic()

  const getSheetHeight = useCallback(() => {
    if (typeof window === 'undefined') return 400
    return window.innerHeight * snapPoints[currentSnap]
  }, [snapPoints, currentSnap])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    setIsDragging(true)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = e.touches[0].clientY - startY.current
    // Only allow dragging down
    if (diff > 0) {
      setDragOffset(diff)
    }
  }, [isDragging])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)

    // If dragged more than 100px, close
    if (dragOffset > 100) {
      trigger('light')
      onClose()
    } else if (dragOffset > 50 && currentSnap > 0) {
      // Snap to smaller size
      trigger('selection')
      setCurrentSnap(prev => Math.max(0, prev - 1))
    }

    setDragOffset(0)
  }, [dragOffset, currentSnap, onClose, trigger])

  // Snap to larger size on swipe up
  const handleSwipeUp = useCallback(() => {
    if (currentSnap < snapPoints.length - 1) {
      trigger('selection')
      setCurrentSnap(prev => Math.min(snapPoints.length - 1, prev + 1))
    }
  }, [currentSnap, snapPoints.length, trigger])

  if (!isOpen) return null

  const sheetHeight = getSheetHeight()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-fadeIn"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-[var(--card)] rounded-t-2xl shadow-xl',
          'animate-slideUp',
          className
        )}
        style={{
          height: sheetHeight,
          transform: `translateY(${dragOffset}px)`,
          transition: isDragging ? undefined : 'transform 0.3s ease-out, height 0.3s ease-out',
        }}
      >
        {/* Handle */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
        >
          <div className="w-10 h-1 bg-[var(--border)] rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--border)]">
            <h3 className="text-[16px] font-semibold text-[var(--foreground)]">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg hover:bg-[var(--secondary)] text-[var(--muted-foreground)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div
          className="overflow-auto px-4 py-3"
          style={{ height: `calc(100% - ${title ? '80px' : '40px'})` }}
          onTouchStart={(e) => {
            // Allow upward swipe from content when at scroll top
            if (e.currentTarget.scrollTop === 0) {
              handleSwipeUp()
            }
          }}
        >
          {children}
        </div>

        {/* Safe area padding */}
        <div className="h-safe-area-bottom" />
      </div>
    </>
  )
}
