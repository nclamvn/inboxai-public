'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Email } from '@/types'

interface UseEmailsOptions {
  folder?: 'inbox' | 'sent' | 'starred' | 'archive' | 'trash'
  pageSize?: number
  accountIds?: string[] // Filter by specific account(s)
}

export function useEmails({ folder = 'inbox', pageSize = 50, accountIds }: UseEmailsOptions = {}) {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  // CURSOR-BASED: Track cursor (received_at timestamp) instead of page number
  const cursorRef = useRef<string | null>(null)

  const supabase = createClient()

  // Build base query with folder filters
  const buildQuery = useCallback((userId: string) => {
    let query = supabase
      .from('emails')
      .select(`
        id, from_name, from_address, to_addresses, subject,
        received_at, is_read, is_starred, is_archived, is_deleted,
        priority, category, needs_reply, detected_deadline, direction,
        summary, ai_confidence, source_account_id
      `)
      .eq('user_id', userId)

    // Apply account filter if specified
    if (accountIds && accountIds.length > 0) {
      query = query.in('source_account_id', accountIds)
    }

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
  }, [folder, accountIds, supabase])

  // Fetch initial page - CURSOR-BASED O(1) vs O(n) offset
  const fetchEmails = useCallback(async () => {
    setLoading(true)
    setError(null)
    cursorRef.current = null

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Fetch pageSize + 1 to check if there's more
      const { data, error: fetchError } = await buildQuery(user.id)
        .order('received_at', { ascending: false })
        .limit(pageSize + 1)

      if (fetchError) throw fetchError

      const allData = data as Email[] || []
      // Check if there's more by seeing if we got extra item
      const hasMoreItems = allData.length > pageSize
      const fetchedEmails = hasMoreItems ? allData.slice(0, pageSize) : allData

      setEmails(fetchedEmails)
      setHasMore(hasMoreItems)
      // Set cursor to last item's timestamp for next page
      cursorRef.current = fetchedEmails.length > 0
        ? fetchedEmails[fetchedEmails.length - 1].received_at
        : null
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails')
    } finally {
      setLoading(false)
    }
  }, [buildQuery, pageSize, supabase])

  // Load more emails - CURSOR-BASED O(1) pagination
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursorRef.current) return

    setLoadingMore(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // CURSOR-BASED: Use .lt() on received_at instead of .range()
      // This is O(1) with index vs O(n) with offset
      const { data, error: fetchError } = await buildQuery(user.id)
        .lt('received_at', cursorRef.current)
        .order('received_at', { ascending: false })
        .limit(pageSize + 1)

      if (fetchError) throw fetchError

      const allData = data as Email[] || []
      const hasMoreItems = allData.length > pageSize
      const newEmails = hasMoreItems ? allData.slice(0, pageSize) : allData

      if (newEmails.length > 0) {
        setEmails(prev => [...prev, ...newEmails])
        // Update cursor to last item's timestamp
        cursorRef.current = newEmails[newEmails.length - 1].received_at
      }
      setHasMore(hasMoreItems)
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

  const emptyTrash = async () => {
    const { error } = await supabase
      .from('emails')
      .delete()
      .eq('is_deleted', true)

    if (!error) {
      setEmails([])
    }
    return !error
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
    emptyTrash,
  }
}
