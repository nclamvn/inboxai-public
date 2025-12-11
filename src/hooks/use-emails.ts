'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Email } from '@/types'

interface UseEmailsOptions {
  folder?: 'inbox' | 'sent' | 'starred' | 'archive' | 'trash'
  limit?: number
}

export function useEmails({ folder = 'inbox', limit = 50 }: UseEmailsOptions = {}) {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchEmails = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let query = supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id)

      // Apply folder-specific filters
      switch (folder) {
        case 'inbox':
          query = query
            .eq('direction', 'inbound')
            .eq('is_archived', false)
            .eq('is_deleted', false)
          break
        case 'sent':
          query = query
            .eq('direction', 'outbound')
            .eq('is_deleted', false)
          break
        case 'starred':
          query = query
            .eq('is_starred', true)
            .eq('is_deleted', false)
          break
        case 'archive':
          query = query
            .eq('is_archived', true)
            .eq('is_deleted', false)
          break
        case 'trash':
          query = query.eq('is_deleted', true)
          break
      }

      const { data, error: fetchError } = await query
        .order('received_at', { ascending: false })
        .limit(limit)

      if (fetchError) throw fetchError

      setEmails(data as Email[] || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails')
    } finally {
      setLoading(false)
    }
  }, [folder, limit, supabase])

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

  const markAsRead = async (emailId: string) => {
    const { error } = await supabase
      .from('emails')
      .update({ is_read: true })
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_read: true } : e))
    }
  }

  const toggleStar = async (emailId: string) => {
    const email = emails.find(e => e.id === emailId)
    if (!email) return

    const newStarred = !email.is_starred

    const { error } = await supabase
      .from('emails')
      .update({ is_starred: newStarred })
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_starred: newStarred } : e))
    }
  }

  const archiveEmail = async (emailId: string) => {
    const { error } = await supabase
      .from('emails')
      .update({ is_archived: true })
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.filter(e => e.id !== emailId))
    }
  }

  const deleteEmail = async (emailId: string) => {
    const { error } = await supabase
      .from('emails')
      .update({ is_deleted: true })
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.filter(e => e.id !== emailId))
    }
  }

  const restoreEmail = async (emailId: string) => {
    const { error } = await supabase
      .from('emails')
      .update({ is_deleted: false, is_archived: false })
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.filter(e => e.id !== emailId))
    }
  }

  const permanentDelete = async (emailId: string) => {
    const { error } = await supabase
      .from('emails')
      .delete()
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.filter(e => e.id !== emailId))
    }
  }

  return {
    emails,
    loading,
    error,
    refetch: fetchEmails,
    markAsRead,
    toggleStar,
    archiveEmail,
    deleteEmail,
    restoreEmail,
    permanentDelete,
  }
}
