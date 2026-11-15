'use client'

/**
 * Offline Banner
 * Shows a banner when user is offline or comes back online
 */

import { WifiOff, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { useHydrated } from '@/hooks/use-hydrated'

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus()
  const showBackOnline = wasOffline && isOnline
  const mounted = useHydrated()

  // Don't render until client-side hydration is complete (prevents flash)
  if (!mounted) return null

  // Don't show anything if online and not showing "back online" message
  if (isOnline && !showBackOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] px-4 py-2 flex items-center justify-center gap-2 border-b-2 bg-[var(--surface)] text-sm font-medium',
        !isOnline && 'border-[var(--warning)] text-[var(--warning)]',
        showBackOnline && isOnline && 'border-[var(--success)] text-[var(--success)]'
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Bạn đang offline. Một số tính năng có thể bị hạn chế.</span>
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
