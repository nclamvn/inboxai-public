'use client'

import { useCallback } from 'react'
import { useAutoSync } from '@/hooks/use-auto-sync'
import { toastSuccess, toastInfo } from '@/lib/toast'
import { useQueryClient } from '@tanstack/react-query'

interface AutoSyncProviderProps {
  children: React.ReactNode
  enabled?: boolean
  interval?: number // in ms, default 30s
}

/**
 * AutoSyncProvider - Automatically syncs emails in the background
 *
 * Features:
 * - Polls for new emails every 30 seconds
 * - Shows toast notification when new emails arrive
 * - Invalidates email queries to refresh the inbox
 * - Syncs on window focus/visibility change
 */
export function AutoSyncProvider({
  children,
  enabled = true,
  interval = 30000
}: AutoSyncProviderProps) {
  const queryClient = useQueryClient()
  const onNewEmails = useCallback((count: number) => {
    if (count === 1) {
      toastInfo('Email mới', 'Bạn có 1 email mới')
    } else if (count > 1) {
      toastSuccess('Email mới', `Bạn có ${count} email mới`)
    }

    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['email-counts'] })
    queryClient.invalidateQueries({ queryKey: ['unread-count'] })
  }, [queryClient])
  const onSync = useCallback((result: { synced: number }) => {
    if (process.env.NODE_ENV === 'development' && result.synced > 0) {
      console.log(`[AutoSync] Synced ${result.synced} emails`)
    }
  }, [])
  const onError = useCallback((error: Error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[AutoSync] Error:', error.message)
    }
  }, [])

  useAutoSync({ enabled, interval, onNewEmails, onSync, onError })

  return <>{children}</>
}
