'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronDown, MessagesSquare, Reply } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { replyHref } from '@/lib/replies/contracts'
import { cn } from '@/lib/utils'
import type { Email } from '@/types'

type Cursor = { at: string; id: string }
type ConversationPage = {
  account: string | null
  replyId: string | null
  messages: {
    id: string
    direction: Email['direction']
    sender: string | null
    subject: string | null
    preview: string | null
    unread: boolean
    at: string
  }[]
  older: Cursor | null
}

const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

async function loadConversation(id: string, before: Cursor | null, signal: AbortSignal): Promise<ConversationPage> {
  const suffix = before ? '?' + new URLSearchParams({ beforeAt: before.at, beforeId: before.id }) : ''
  const response = await fetch('/api/emails/' + encodeURIComponent(id) + '/conversation' + suffix, { signal })
  if (!response.ok) throw new Error('Chưa thể mở hội thoại.')
  return response.json()
}

export function EmailConversation({ email, folder = 'inbox', className }: {
  email: Email
  folder?: 'inbox' | 'sent'
  className?: string
}) {
  const params = useSearchParams()
  const [open, setOpen] = useState(params.get('conversation') === '1')
  const available = Boolean(email.source_account_id && !email.is_deleted && !email.provider_deleted)
  const query = useInfiniteQuery({
    queryKey: ['email-conversation', email.user_id, email.id],
    queryFn: ({ pageParam, signal }) => loadConversation(email.id, pageParam, signal),
    initialPageParam: null as Cursor | null,
    getNextPageParam: page => page.older,
    enabled: available,
    staleTime: 0,
    refetchInterval: open ? 30_000 : false,
    retry: false,
  })
  const latest = query.data?.pages[0]
  if (!available || (latest && latest.messages.length <= 1 && !latest.older)) return null
  const messages = [...new Map(query.data?.pages.flatMap(page => page.messages)
    .map(message => [message.id, message])).values()]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))

  return (
    <section aria-label="Hội thoại" className={cn('mb-4 min-w-0 border border-[var(--border)]', className)}>
      <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="group">
        <summary className="neo-section-accent neo-target flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm focus-ring">
          <MessagesSquare size={16} aria-hidden="true" className="shrink-0 text-[var(--accent-foreground)]" />
          <span className="font-semibold">Hội thoại</span>
          {latest && <span className="text-xs text-[var(--foreground-muted)]">{messages.length}{query.hasNextPage ? '+' : ''} thư</span>}
          <ChevronDown size={16} aria-hidden="true" className="ms-auto shrink-0 text-[var(--accent-foreground)] group-open:rotate-180" />
        </summary>
        {query.isPending && <p role="status" className="px-3 py-2 text-sm">Đang mở hội thoại…</p>}
        {query.isError && <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <p role="status" className="text-sm text-[var(--error)]">Chưa thể tải hội thoại.</p>
          <Button type="button" size="sm" variant="outline"
            onClick={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}>Thử lại</Button>
        </div>}
        {latest?.account && (
          <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground-muted)] break-all">{latest.account}</p>
        )}
        {query.hasNextPage && !query.isFetchNextPageError && (
          <div className="border-t border-[var(--border)] px-3 py-2">
            <Button type="button" size="sm" variant="outline" loading={query.isFetchingNextPage} disabled={query.isFetching}
              onClick={() => void query.fetchNextPage()}>Xem thư cũ hơn</Button>
          </div>
        )}
        {latest && (
          <ol className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {messages.map(message => {
              const current = message.id === email.id
              const direction = message.direction === 'outbound' ? 'Thư đi' : 'Thư đến'
              const href = '/' + folder + '?email=' + encodeURIComponent(message.id) + '&conversation=1'
              const item = <>
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--foreground-muted)]">
                  <span className={cn('font-medium', message.direction === 'outbound' && 'text-[var(--success)]')}>{direction}</span>
                  <span className="min-w-0 break-words">{message.sender}</span>
                  <time dateTime={message.at} className="ms-auto whitespace-nowrap tabular-nums">{date.format(new Date(message.at))}</time>
                </span>
                <span className="mt-1 block break-words text-sm font-medium">{message.subject || '(Không có tiêu đề)'}</span>
                {current ? <span className="text-xs text-[var(--accent-foreground)]">Đang xem</span> :
                  message.preview && <span className="mt-1 block truncate text-xs text-[var(--foreground-muted)]">{message.preview}</span>}
                {message.unread && !current && <span className="sr-only">Chưa đọc</span>}
              </>
              return <li key={message.id}>
                {current ? <div aria-current="true" className="neo-section-accent px-3 py-2">{item}</div> :
                  <Link href={href} prefetch={false} scroll={false} className="neo-target block min-h-11 px-3 py-2 hover:bg-[var(--hover)] focus-ring">{item}</Link>}
              </li>
            })}
          </ol>
        )}
        {email.direction === 'outbound' && latest?.replyId && (
          <Link href={replyHref(latest.replyId)} prefetch={false}
            className="neo-target inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4">
            <Reply size={16} aria-hidden="true" /> Trả lời hội thoại
          </Link>
        )}
      </details>
    </section>
  )
}
