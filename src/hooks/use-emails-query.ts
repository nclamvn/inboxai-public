'use client'

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Email } from '@/types'

interface EmailsQueryData {
  emails: Email[]
  nextCursor: string | null
  hasMore: boolean
}

interface InfiniteEmailsData {
  pages: EmailsQueryData[]
  pageParams: (string | null)[]
}

interface FetchEmailsParams {
  folder?: 'inbox' | 'sent' | 'starred' | 'archive' | 'trash'
  category?: string | null
  pageSize?: number
}

// Fetch emails with CURSOR-BASED pagination (O(1) with index vs O(n) with offset)
async function fetchEmails(params: FetchEmailsParams & { cursor?: string | null }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { folder = 'inbox', category, pageSize = 30, cursor } = params

  let query = supabase
    .from('emails')
    .select(`
      id, from_name, from_address, to_addresses, subject,
      received_at, is_read, is_starred, is_archived, is_deleted,
      priority, category, needs_reply, detected_deadline, direction,
      summary, ai_confidence
    `)
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

  // CURSOR-BASED pagination: Use received_at as cursor
  // This is O(1) with a proper index, vs O(n) for offset-based
  if (cursor) {
    query = query.lt('received_at', cursor)
  }

  // Fetch one extra to check if there's more
  const { data, error } = await query
    .order('received_at', { ascending: false })
    .limit(pageSize + 1)

  if (error) throw error

  const emails = data as Email[] || []
  const hasMore = emails.length > pageSize
  const items = hasMore ? emails.slice(0, pageSize) : emails

  // Next cursor is the last item's timestamp
  const nextCursor = items.length > 0 ? items[items.length - 1].received_at : null

  return {
    emails: items,
    nextCursor,
    hasMore,
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

// Infinite query for emails with CURSOR-BASED pagination (for infinite scroll)
export function useEmailsInfinite(params: FetchEmailsParams = {}) {
  return useInfiniteQuery({
    queryKey: ['emails-infinite', params.folder, params.category],
    queryFn: ({ pageParam }) => fetchEmails({ ...params, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null as string | null,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnMount: false, // Don't refetch if data is fresh
  })
}

// Simple query for emails (single page, first 30 emails)
export function useEmailsQuery(params: FetchEmailsParams = {}) {
  return useQuery({
    queryKey: ['emails', params.folder, params.category],
    queryFn: () => fetchEmails({ ...params, cursor: null }),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnMount: false,
  })
}

// Single email detail with longer cache
export function useEmailDetailQuery(emailId: string | null) {
  return useQuery({
    queryKey: ['email-detail', emailId],
    queryFn: () => fetchEmailDetail(emailId!),
    enabled: !!emailId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
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

// Prefetch emails for instant navigation
export function usePrefetchEmails() {
  const queryClient = useQueryClient()

  return (params: FetchEmailsParams) => {
    queryClient.prefetchQuery({
      queryKey: ['emails', params.folder, params.category],
      queryFn: () => fetchEmails({ ...params, cursor: null }),
      staleTime: 60 * 1000,
    })
  }
}

// Prefetch common folders on dashboard load
export function usePrefetchCommonFolders() {
  const queryClient = useQueryClient()

  return () => {
    // Prefetch inbox, starred, and archive
    const folders: Array<FetchEmailsParams['folder']> = ['inbox', 'starred', 'archive']

    folders.forEach(folder => {
      queryClient.prefetchQuery({
        queryKey: ['emails', folder, null],
        queryFn: () => fetchEmails({ folder, cursor: null }),
        staleTime: 60 * 1000,
      })
    })
  }
}
