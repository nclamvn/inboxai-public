'use client'

import { useEffect, useCallback, useRef, useState } from 'react'

interface SyncResult {
  success: boolean
  synced: number
  skipped?: boolean
  error?: string
}

interface UseAutoSyncOptions {
  interval?: number       // Polling interval in ms (default: 30s)
  enabled?: boolean
  onSync?: (result: SyncResult) => void
  onError?: (error: Error) => void
  onNewEmails?: (count: number) => void
}

export function useAutoSync({
  interval = 30000,
  enabled = true,
  onSync,
  onError,
  onNewEmails
}: UseAutoSyncOptions = {}) {
  const lastSyncRef = useRef<number>(0)
  const syncingRef = useRef<boolean>(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const sync = useCallback(async (force: boolean = false): Promise<SyncResult | null> => {
    // Skip if already syncing
    if (syncingRef.current) return null

    // Skip if synced recently (unless forced)
    const now = Date.now()
    if (!force && now - lastSyncRef.current < interval) {
      return { success: true, synced: 0, skipped: true }
    }

    syncingRef.current = true
    setIsSyncing(true)
    setSyncError(null)

    try {
      const res = await fetch('/api/source-accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'incremental' })
      })

      if (!res.ok) {
        throw new Error('Sync failed')
      }

      const result = await res.json() as SyncResult
      lastSyncRef.current = now
      setLastSyncTime(new Date())

      if (result.synced > 0) {
        onNewEmails?.(result.synced)
      }

      onSync?.(result)
      return result
    } catch (error) {
      const err = error as Error
      setSyncError(err.message)
      onError?.(err)
      return { success: false, synced: 0, error: err.message }
    } finally {
      syncingRef.current = false
      setIsSyncing(false)
    }
  }, [interval, onSync, onError, onNewEmails])

  useEffect(() => {
    if (!enabled) return

    // Initial sync after short delay
    const initialTimeout = setTimeout(() => sync(true), 2000)

    // Set up polling
    const intervalId = setInterval(() => sync(), interval)

    // Sync on visibility change (when user comes back to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Only sync if last sync was more than 10 seconds ago
        if (Date.now() - lastSyncRef.current > 10000) {
          sync(true)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Sync on window focus
    const handleFocus = () => {
      if (Date.now() - lastSyncRef.current > 10000) {
        sync()
      }
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [enabled, interval, sync])

  return {
    sync: () => sync(true),
    isSyncing,
    lastSyncTime,
    syncError
  }
}
