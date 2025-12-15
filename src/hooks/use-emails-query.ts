'use client'

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Email } from '@/types'

interface EmailsQueryData {
  emails: Email[]
  total: number
  hasMore: boolean
}

interface InfiniteEmailsData {
  pages: EmailsQueryData[]
  pageParams: number[]
}

interface FetchEmailsParams {
  folder?: 'inbox' | 'sent' | 'starred' | 'archive' | 'trash'
  category?: string | null
  pageSize?: number
}

// Fetch emails with pagination using Supabase directly (faster than API route)
async function fetchEmails(params: FetchEmailsParams & { page: number }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { folder = 'inbox', category, pageSize = 20, page } = params
  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('emails')
    .select(`
      id, from_name, from_address, to_addresses, subject,
      received_at, is_read, is_starred, is_archived, is_deleted,
      priority, category, needs_reply, detected_deadline, direction,
      summary, ai_confidence
    `, { count: 'exact' })
    .eq('user_id', user.id)

  // Folder filters
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

  // Category filter
  if (category && category !== 'all' && category !== 'needsAction') {
    query = query.eq('category', category)
  }

  // Needs action filter
  if (category === 'needsAction') {
    query = query
      .eq('is_read', false)
      .or('priority.gte.4,needs_reply.eq.true,detected_deadline.not.is.null')
  }

  const { data, error, count } = await query
    .order('received_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return {
    emails: data as Email[] || [],
    total: count || 0,
    hasMore: (from + pageSize) < (count || 0),
    nextPage: page + 1,
  }
}

// Fetch single email with full body
async function fetchEmailDetail(emailId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error) throw error
  return data as Email
}

// Update email
async function updateEmail(emailId: string, updates: Partial<Email>) {
  const supabase = createClient()
  const { error } = await supabase
    .from('emails')
    .update(updates)
    .eq('id', emailId)

  if (error) throw error
}

// Infinite query for emails (for infinite scroll)
export function useEmailsInfinite(params: FetchEmailsParams = {}) {
  return useInfiniteQuery({
    queryKey: ['emails-infinite', params.folder, params.category],
    queryFn: ({ pageParam = 0 }) => fetchEmails({ ...params, page: pageParam }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextPage : undefined,
    initialPageParam: 0,
    staleTime: 30 * 1000,
  })
}

// Simple query for emails (single page)
export function useEmailsQuery(params: FetchEmailsParams = {}) {
  return useQuery({
    queryKey: ['emails', params.folder, params.category],
    queryFn: () => fetchEmails({ ...params, page: 0 }),
    staleTime: 30 * 1000,
  })
}

// Single email detail
export function useEmailDetailQuery(emailId: string | null) {
  return useQuery({
    queryKey: ['email-detail', emailId],
    queryFn: () => fetchEmailDetail(emailId!),
    enabled: !!emailId,
    staleTime: 60 * 1000,
  })
}

// Mutations
export function useUpdateEmailMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ emailId, updates }: { emailId: string; updates: Partial<Email> }) =>
      updateEmail(emailId, updates),

    // Optimistic update
    onMutate: async ({ emailId, updates }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['emails'] })
      await queryClient.cancelQueries({ queryKey: ['emails-infinite'] })

      // Snapshot previous data
      const previousData = queryClient.getQueriesData({ queryKey: ['emails'] })

      // Optimistically update
      queryClient.setQueriesData({ queryKey: ['emails'] }, (old: EmailsQueryData | undefined) => {
        if (!old) return old
        return {
          ...old,
          emails: old.emails?.map((e: Email) =>
            e.id === emailId ? { ...e, ...updates } : e
          ),
        }
      })

      // Update infinite query data too
      queryClient.setQueriesData({ queryKey: ['emails-infinite'] }, (old: InfiniteEmailsData | undefined) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page: EmailsQueryData) => ({
            ...page,
            emails: page.emails?.map((e: Email) =>
              e.id === emailId ? { ...e, ...updates } : e
            ),
          })),
        }
      })

      return { previousData }
    },

    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([key, data]) => {
          queryClient.setQueryData(key, data)
        })
      }
    },

    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['emails-infinite'] })
    },
  })
}

// Mark as read
export function useMarkAsRead() {
  const mutation = useUpdateEmailMutation()
  return (emailId: string) => mutation.mutate({ emailId, updates: { is_read: true } })
}

// Toggle star
export function useToggleStar() {
  const queryClient = useQueryClient()
  const mutation = useUpdateEmailMutation()

  return (emailId: string, currentStarred: boolean) => {
    mutation.mutate({ emailId, updates: { is_starred: !currentStarred } })
  }
}

// Archive email
export function useArchiveEmail() {
  const mutation = useUpdateEmailMutation()
  return (emailId: string) => mutation.mutate({ emailId, updates: { is_archived: true } })
}

// Delete email (soft delete)
export function useDeleteEmail() {
  const mutation = useUpdateEmailMutation()
  return (emailId: string) => mutation.mutate({ emailId, updates: { is_deleted: true } })
}

// Prefetch emails
export function usePrefetchEmails() {
  const queryClient = useQueryClient()

  return (params: FetchEmailsParams) => {
    queryClient.prefetchQuery({
      queryKey: ['emails', params.folder, params.category],
      queryFn: () => fetchEmails({ ...params, page: 0 }),
      staleTime: 30 * 1000,
    })
  }
}
