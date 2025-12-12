'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Email } from '@/types'

/**
 * Hook to fetch a single email by ID
 * Uses API route to enable lazy body loading from IMAP
 */
export function useEmail(emailId: string | null) {
  const [email, setEmail] = useState<Email | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEmail = useCallback(async () => {
    if (!emailId) {
      setEmail(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // CRITICAL: Use API route instead of direct Supabase query
      // This enables lazy body loading from IMAP for emails without body_fetched
      const res = await fetch(`/api/emails/${emailId}`)

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to fetch email: ${res.status}`)
      }

      const data = await res.json()
      setEmail(data.email as Email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email')
      setEmail(null)
    } finally {
      setLoading(false)
    }
  }, [emailId])

  useEffect(() => {
    fetchEmail()
  }, [fetchEmail])

  return {
    email,
    loading,
    error,
    refetch: fetchEmail,
  }
}
