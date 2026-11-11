'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Email, InboxPriority } from '@/types'

export interface InboxPriorityResult {
  status: 'saved' | 'conflict'
  choice: InboxPriority
  version: number
}

interface UseEmailsOptions {
  folder?: 'inbox' | 'sent' | 'starred' | 'archive' | 'trash'
  pageSize?: number
  accountIds?: string[] // Filter by specific account(s)
}

const emailListFields = `
  id, from_name, from_address, to_addresses, subject,
  received_at, is_read, is_starred, is_archived, is_deleted,
  priority, category, needs_reply, detected_deadline, direction,
  summary, ai_confidence, source_account_id`
const inboxListFields = `${emailListFields}, snippet:inbox_preview, inbox_priority, inbox_priority_version` as const

export function useEmails({ folder = 'inbox', pageSize = 50, accountIds }: UseEmailsOptions = {}) {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageError, setPageError] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const cursorRef = useRef<Pick<Email, 'received_at' | 'id'> | null>(null)
  const requestGeneration = useRef(0)
  const paging = useRef(false)

  const supabase = createClient()

  // Build base query with folder filters
  const buildQuery = useCallback((userId: string) => {
    const table = supabase.from('emails')
    const projection = folder === 'inbox' ? table.select(inboxListFields) : table.select(emailListFields)
    let query = projection.eq('user_id', userId)

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
          .eq('provider_deleted', false)
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
    const generation = ++requestGeneration.current
    setLoading(true)
    setLoadingMore(false)
    paging.current = false
    setError(null)
    setPageError(false)
    cursorRef.current = null

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Fetch pageSize + 1 to check if there's more
      const { data, error: fetchError } = await buildQuery(user.id)
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(pageSize + 1)

      if (generation !== requestGeneration.current) return
      if (fetchError) throw fetchError

      const allData = data as Email[] || []
      // Check if there's more by seeing if we got extra item
      const hasMoreItems = allData.length > pageSize
      const fetchedEmails = hasMoreItems ? allData.slice(0, pageSize) : allData

      setEmails(previous => {
        if (folder !== 'inbox') return fetchedEmails
        const byId = new Map(previous.map(email => [email.id, email]))
        return fetchedEmails.map(email => {
          const previousEmail = byId.get(email.id)
          return previousEmail && (previousEmail.inbox_priority_version ?? 0) > (email.inbox_priority_version ?? 0)
            ? { ...email, inbox_priority: previousEmail.inbox_priority, inbox_priority_version: previousEmail.inbox_priority_version }
            : email
        })
      })
      setHasMore(hasMoreItems)
      // Set cursor to last item's timestamp for next page
      cursorRef.current = fetchedEmails.at(-1) ?? null
    } catch (err) {
      if (generation === requestGeneration.current) {
        setEmails([])
        setHasMore(false)
        setError(err instanceof Error ? err.message : 'Failed to fetch emails')
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false)
    }
  }, [buildQuery, folder, pageSize, supabase])

  // Load more emails - CURSOR-BASED O(1) pagination
  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current
    if (paging.current || !hasMore || !cursor) return
    const generation = requestGeneration.current
    paging.current = true

    setLoadingMore(true)
    setPageError(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const query = buildQuery(user.id)
      const page = cursor.received_at === null
        ? query.is('received_at', null).lt('id', cursor.id)
        : query.or(`received_at.lt.${cursor.received_at},and(received_at.eq.${cursor.received_at},id.lt.${cursor.id}),received_at.is.null`)
      const { data, error: fetchError } = await page
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(pageSize + 1)

      if (generation !== requestGeneration.current) return
      if (fetchError) throw fetchError

      const allData = data as Email[] || []
      const hasMoreItems = allData.length > pageSize
      const newEmails = hasMoreItems ? allData.slice(0, pageSize) : allData

      if (newEmails.length > 0) {
        setEmails(prev => {
          const loaded = new Set(prev.map(email => email.id))
          return [...prev, ...newEmails.filter(email => !loaded.has(email.id))]
        })
        cursorRef.current = newEmails[newEmails.length - 1]
      }
      setHasMore(hasMoreItems)
    } catch {
      if (generation === requestGeneration.current) setPageError(true)
    } finally {
      if (generation === requestGeneration.current) {
        paging.current = false
        setLoadingMore(false)
      }
    }
  }, [buildQuery, hasMore, pageSize, supabase])

  useEffect(() => {
    fetchEmails()
    return () => { requestGeneration.current++ }
  }, [fetchEmails])

  const setInboxPriority = async (emailId: string, choice: InboxPriority, version: number): Promise<InboxPriorityResult> => {
    const { data, error } = await supabase.rpc('set_inbox_priority', {
      p_email_id: emailId, p_choice: choice, p_version: version,
    }).abortSignal(AbortSignal.timeout(10_000))
    if (error) throw error

    const result = data as InboxPriorityResult
    setEmails(previous => previous.map(email =>
      email.id === emailId && (email.inbox_priority_version ?? 0) <= result.version
        ? { ...email, inbox_priority: result.choice, inbox_priority_version: result.version }
        : email,
    ))
    window.dispatchEvent(new Event('inbox-priority-changed'))
    return result
  }

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
    pageError,
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
    setInboxPriority,
  }
}
