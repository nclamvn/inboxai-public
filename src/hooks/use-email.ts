'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Email } from '@/types'

/**
 * Hook to fetch a single email by ID
 * Uses API route to enable lazy body loading from IMAP
 */
export function useEmail(emailId: string | null) {
  const [result, setResult] = useState<{ id: string; email: Email | null; error: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const request = useRef<AbortController | null>(null)

  const fetchEmail = useCallback(async () => {
    request.current?.abort()
    if (!emailId) return
    const controller = new AbortController()
    request.current = controller

    setLoading(true)

    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(emailId)}`, { signal: controller.signal })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to fetch email: ${res.status}`)
      }

      const data = await res.json()
      if (!controller.signal.aborted) setResult({ id: emailId, email: data.email as Email, error: null })
    } catch (err) {
      if (!controller.signal.aborted) {
        setResult({ id: emailId, email: null, error: err instanceof Error ? err.message : 'Failed to fetch email' })
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [emailId])

  useEffect(() => {
    void fetchEmail()
    return () => request.current?.abort()
  }, [fetchEmail])

  const current = result?.id === emailId ? result : null
  return {
    email: current?.email ?? null,
    loading: Boolean(emailId && (loading || !current)),
    error: current?.error ?? null,
    refetch: fetchEmail,
  }
}
