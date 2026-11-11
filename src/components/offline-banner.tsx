'use client'

/**
 * Offline Banner
 * Shows a banner when user is offline or comes back online
 */

import { useEffect, useState } from 'react'
import { WifiOff, Wifi, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { useHydrated } from '@/hooks/use-hydrated'

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus()
  const showBackOnline = wasOffline && isOnline
  const [dismissed, setDismissed] = useState(false)
  const mounted = useHydrated()

  // Reset dismissed state when going offline
  useEffect(() => {
    const reset = () => setDismissed(false)
    window.addEventListener('online', reset)
    window.addEventListener('offline', reset)
    return () => {
      window.removeEventListener('online', reset)
      window.removeEventListener('offline', reset)
    }
  }, [])

  // Don't render until client-side hydration is complete (prevents flash)
  if (!mounted) return null

  // Don't show anything if online and not showing "back online" message
  if (isOnline && !showBackOnline) return null

  // Don't show if user dismissed the banner
  if (dismissed && isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
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
