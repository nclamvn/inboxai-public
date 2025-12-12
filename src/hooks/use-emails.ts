'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Email } from '@/types'

interface UseEmailsOptions {
  folder?: 'inbox' | 'sent' | 'starred' | 'archive' | 'trash'
  pageSize?: number
}

export function useEmails({ folder = 'inbox', pageSize = 50 }: UseEmailsOptions = {}) {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)

  const supabase = createClient()

  // Build base query with folder filters
  const buildQuery = useCallback((userId: string) => {
    let query = supabase
      .from('emails')
      .select(`
        id, from_name, from_address, to_addresses, subject,
        received_at, is_read, is_starred, is_archived, is_deleted,
        priority, category, needs_reply, detected_deadline, direction,
        summary, ai_confidence
      `)
      .eq('user_id', userId)

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

    return query
  }, [folder, supabase])

  // Fetch initial page
  const fetchEmails = useCallback(async () => {
    setLoading(true)
    setError(null)
    pageRef.current = 0

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: fetchError } = await buildQuery(user.id)
        .order('received_at', { ascending: false })
        .range(0, pageSize - 1)

      if (fetchError) throw fetchError

      const fetchedEmails = data as Email[] || []
      setEmails(fetchedEmails)
      setHasMore(fetchedEmails.length === pageSize)
      pageRef.current = 1
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails')
    } finally {
      setLoading(false)
    }
  }, [buildQuery, pageSize, supabase])

  // Load more emails (pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const from = pageRef.current * pageSize
      const to = from + pageSize - 1

      const { data, error: fetchError } = await buildQuery(user.id)
        .order('received_at', { ascending: false })
        .range(from, to)

      if (fetchError) throw fetchError

      const newEmails = data as Email[] || []
      if (newEmails.length > 0) {
        setEmails(prev => [...prev, ...newEmails])
        pageRef.current += 1
      }
      setHasMore(newEmails.length === pageSize)
    } catch (err) {
      console.error('Load more error:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [buildQuery, hasMore, loadingMore, pageSize, supabase])

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
    loadingMore,
    error,
    hasMore,
    refetch: fetchEmails,
    loadMore,
    markAsRead,
    toggleStar,
    archiveEmail,
    deleteEmail,
    restoreEmail,
    permanentDelete,
  }
}
