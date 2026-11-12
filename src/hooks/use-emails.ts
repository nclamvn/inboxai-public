'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { gmailTriageRefresh, useGmailTriage } from '@/components/email/gmail-triage'
import { emailSnoozeChanged } from '@/lib/snooze/client'
import { triageBatchLimit, type TriageFlag } from '@/lib/gmail-triage/contracts'
import type { Email, InboxPriority } from '@/types'

export interface InboxPriorityResult {
  status: 'saved' | 'conflict'
  choice: InboxPriority
  version: number
}

interface UseEmailsOptions {
  folder?: 'inbox' | 'snoozed' | 'sent' | 'starred' | 'archive' | 'trash'
  pageSize?: number
  accountIds?: string[] // Filter by specific account(s)
}

const emailListFields = `
  id, from_name, from_address, to_addresses, subject,
  received_at, is_read, is_starred, is_archived, is_deleted,
  priority, category, needs_reply, detected_deadline, direction,
  summary, ai_confidence, source_account_id, attachment_count, sync_namespace, snoozed_until, snooze_version`
const inboxListFields = `${emailListFields}, snippet:inbox_preview, inbox_priority, inbox_priority_version, inbox_appearance_at` as const

export function useEmails({ folder = 'inbox', pageSize = 50, accountIds }: UseEmailsOptions = {}) {
  const [userId, setUserId] = useState<string | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageError, setPageError] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const cursorRef = useRef<Email | null>(null)
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const managesSnoozes = folder === 'inbox' || folder === 'snoozed'
  const orderField = folder === 'inbox' ? 'inbox_appearance_at' : folder === 'snoozed' ? 'snoozed_until' : 'received_at'
  const ascending = folder === 'snoozed'
  const requestGeneration = useRef(0)
  const paging = useRef(false)

  const supabase = createClient()
  const { enabled: triageEnabled, run: runTriage } = useGmailTriage()

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
      case 'snoozed':
        query = query
          .eq('direction', 'inbound')
          .eq('is_archived', false)
          .eq('is_deleted', false)
          .eq('provider_deleted', false)
          .eq('email_is_snoozed', folder === 'snoozed')
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
  const fetchEmails = useCallback(async function refresh(quiet = false) {
    const generation = ++requestGeneration.current
    if (wakeTimer.current !== null) clearTimeout(wakeTimer.current)
    if (!quiet) setLoading(true)
    setLoadingMore(false)
    paging.current = false
    setError(null)
    setPageError(false)
    if (!quiet) cursorRef.current = null

    try {
      // Probe before reading the list so a deadline crossed between the two
      // requests either appears in this page or still has a timer to refresh it.
      const [session, clock] = await Promise.all([
        supabase.auth.getUser(),
        managesSnoozes ? supabase.rpc('email_snooze_clock', { p_accounts: accountIds ?? null })
          .abortSignal(AbortSignal.timeout(5000)) : null,
      ])
      const { data: { user } } = session
      if (generation !== requestGeneration.current) return
      setUserId(user?.id ?? null)
      if (!user) throw new Error('Not authenticated')

      if (clock && !clock.error && clock.data?.nextAt) {
        const wait = Date.parse(clock.data.nextAt) - Date.parse(clock.data.now)
        if (Number.isFinite(wait)) wakeTimer.current = setTimeout(() => { void refresh(true) }, Math.max(25, Math.min(wait, 2_147_483_647)))
      } else if (clock?.error) {
        wakeTimer.current = setTimeout(() => { void refresh(true) }, 30_000)
      }

      // Fetch pageSize + 1 to check if there's more
      const { data, error: fetchError } = await buildQuery(user.id)
        .order(orderField, { ascending, nullsFirst: false })
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
        if (!quiet) {
          setEmails([])
          setHasMore(false)
        }
        setError(err instanceof Error ? err.message : 'Failed to fetch emails')
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false)
    }
  }, [accountIds, ascending, buildQuery, folder, managesSnoozes, orderField, pageSize, supabase])

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
      const timestamp = orderField === 'inbox_appearance_at'
        ? cursor.inbox_appearance_at ?? cursor.received_at : cursor[orderField]
      const page = timestamp === null
        ? query.is(orderField, null).lt('id', cursor.id)
        : query.or(`${orderField}.${ascending ? 'gt' : 'lt'}.${timestamp},and(${orderField}.eq.${timestamp},id.lt.${cursor.id}),${orderField}.is.null`)
      const { data, error: fetchError } = await page
        .order(orderField, { ascending, nullsFirst: false })
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
  }, [ascending, buildQuery, hasMore, orderField, pageSize, supabase])

  useEffect(() => {
    void fetchEmails()
    return () => {
      requestGeneration.current++
      if (wakeTimer.current !== null) clearTimeout(wakeTimer.current)
    }
  }, [fetchEmails])

  useEffect(() => {
    if (!triageEnabled && !managesSnoozes) return
    const refresh = () => { void fetchEmails(true) }
    const resume = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener(gmailTriageRefresh, refresh)
    if (managesSnoozes) {
      window.addEventListener(emailSnoozeChanged, refresh)
      window.addEventListener('online', refresh)
      document.addEventListener('visibilitychange', resume)
    }
    return () => {
      window.removeEventListener(gmailTriageRefresh, refresh)
      window.removeEventListener(emailSnoozeChanged, refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [fetchEmails, managesSnoozes, triageEnabled])

  const changeFlags = async (targets: Email[], flag: TriageFlag, desired: boolean) => {
    if (targets.length === 0) return false
    const gmail = triageEnabled ? targets.filter(email => email.sync_namespace === 'gmail') : []
    const local = targets.filter(email => !triageEnabled || email.sync_namespace !== 'gmail')
    let saved = true
    for (let start = 0; start < gmail.length; start += triageBatchLimit) {
      if (!await runTriage({ action: 'apply', id: crypto.randomUUID(), flag, desired,
        emailIds: gmail.slice(start, start + triageBatchLimit).map(email => email.id) })) saved = false
    }
    if (local.length > 0) {
      const { error } = await supabase.from('emails').update({ [`is_${flag}`]: desired })
        .eq('user_id', userId ?? '').in('id', local.map(email => email.id))
      if (error) return false
      await fetchEmails()
    }
    return saved
  }

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

  const markAsRead = async (emailId: string, source?: Email) => {
    const email = source ?? emails.find(row => row.id === emailId)
    if (triageEnabled && email?.sync_namespace === 'gmail') return changeFlags([email], 'read', true)
    const { error } = await supabase
      .from('emails')
      .update({ is_read: true })
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_read: true } : e))
    }
  }

  const toggleStar = async (emailId: string, source?: Email) => {
    const email = source ?? emails.find(e => e.id === emailId)
    if (!email) return

    const newStarred = !email.is_starred
    if (triageEnabled && email.sync_namespace === 'gmail') return changeFlags([email], 'starred', newStarred)

    const { error } = await supabase
      .from('emails')
      .update({ is_starred: newStarred })
      .eq('id', emailId)

    if (!error) {
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_starred: newStarred } : e))
    }
  }

  const archiveEmail = async (emailId: string, source?: Email) => {
    const email = source ?? emails.find(row => row.id === emailId)
    if (triageEnabled && email?.sync_namespace === 'gmail') return changeFlags([email], 'archived', true)
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
    const email = emails.find(row => row.id === emailId)
    if (triageEnabled && folder === 'archive' && email?.sync_namespace === 'gmail') return changeFlags([email], 'archived', false)
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

  const refetch = useCallback(() => fetchEmails(), [fetchEmails])

  return {
    userId,
    emails,
    loading,
    loadingMore,
    error,
    pageError,
    hasMore,
    refetch,
    loadMore,
    changeFlags,
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
