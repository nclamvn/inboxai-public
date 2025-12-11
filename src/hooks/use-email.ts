'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Email } from '@/types'

/**
 * Hook to fetch a single email by ID
 * Used when we need full email details (including body)
 */
export function useEmail(emailId: string | null) {
  const [email, setEmail] = useState<Email | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchEmail = useCallback(async () => {
    if (!emailId) {
      setEmail(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: fetchError } = await supabase
        .from('emails')
        .select('*')
        .eq('id', emailId)
        .eq('user_id', user.id)
        .single()

      if (fetchError) throw fetchError

      setEmail(data as Email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email')
      setEmail(null)
    } finally {
      setLoading(false)
    }
  }, [emailId, supabase])

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
