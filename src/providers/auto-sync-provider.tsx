'use client'

import { useCallback } from 'react'
import { useAutoSync } from '@/hooks/use-auto-sync'
import { gmailTriageRefresh } from '@/components/email/gmail-triage'
import { toastInfo } from '@/lib/toast'
import { useQueryClient } from '@tanstack/react-query'
import { actionNotificationsKey } from '@/lib/notifications/action-contracts'

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
  const onEmailsSynced = useCallback((count: number) => {
    toastInfo('Đồng bộ hộp thư', `Đã đồng bộ ${count} email`)

    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['email-counts'] })
    queryClient.invalidateQueries({ queryKey: ['unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['reply-work'] })
  }, [queryClient])
  const onSync = useCallback((result: { synced: number }) => {
    if (result.synced > 0) window.dispatchEvent(new Event(gmailTriageRefresh))
    void queryClient.invalidateQueries({ queryKey: actionNotificationsKey })
    void queryClient.invalidateQueries({ predicate: ({ queryKey }) =>
      queryKey[0] === 'commitments' && (queryKey[2] === 'attention' || queryKey[2] === 'catchup'),
    })
    if (process.env.NODE_ENV === 'development' && result.synced > 0) {
      console.log(`[AutoSync] Synced ${result.synced} emails`)
    }
  }, [queryClient])
  const onError = useCallback((error: Error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[AutoSync] Error:', error.message)
    }
  }, [])

  useAutoSync({ enabled, interval, onEmailsSynced, onSync, onError })

  return <>{children}</>
}
