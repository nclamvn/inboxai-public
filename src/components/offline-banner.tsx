'use client'

/**
 * Offline Banner
 * Shows a banner when user is offline or comes back online
 */

import { useEffect, useState } from 'react'
import { WifiOff, Wifi, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNetworkStatus } from '@/hooks/use-network-status'

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus()
  const [showBackOnline, setShowBackOnline] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Show "back online" message when connection restored
  useEffect(() => {
    if (wasOffline && isOnline) {
      setShowBackOnline(true)
      setDismissed(false)
      const timer = setTimeout(() => {
        setShowBackOnline(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [wasOffline, isOnline])

  // Reset dismissed state when going offline
  useEffect(() => {
    if (!isOnline) {
      setDismissed(false)
    }
  }, [isOnline])

  // Don't show anything if online and not showing "back online" message
  if (isOnline && !showBackOnline) return null

  // Don't show if user dismissed the banner
  if (dismissed && isOnline) return null

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium transition-all duration-300',
        !isOnline && 'bg-amber-500 text-white',
        showBackOnline && isOnline && 'bg-green-500 text-white'
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Bạn đang offline. Một số tính năng có thể bị hạn chế.</span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-2 p-1 hover:bg-white/20 rounded transition-colors"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </>
      ) : showBackOnline ? (
        <>
          <Wifi className="w-4 h-4" />
          <span>Đã kết nối lại!</span>
        </>
      ) : null}
    </div>
  )
}

export default OfflineBanner
