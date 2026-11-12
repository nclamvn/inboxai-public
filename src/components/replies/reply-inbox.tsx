'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { readReplyWork, replyRequest } from '@/lib/replies/client'
import { replyHref, type ReplyWork } from '@/lib/replies/contracts'

const labels: Record<ReplyWork['status'], string> = {
  reply: 'Có hồi đáp', waiting: 'Đang chờ', draft: 'Bản nháp', sending: 'Cần kiểm tra lượt gửi', sent: 'Đã gửi',
}

export function ReplyInbox({ userId, accounts }: { userId: string; accounts: string[] }) {
  const cache = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const query = useQuery({
    queryKey: ['reply-work', userId, ...accounts],
    queryFn: ({ signal }) => readReplyWork(accounts, signal),
    staleTime: 30_000, refetchOnMount: 'always', refetchInterval: 60_000, retry: false,
  })
  const stop = useMutation({
    mutationFn: (id: string) => replyRequest({ action: 'stop', id }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['reply-work', userId] }),
  })
  const items = query.data ?? []
  if (!items.length && !query.isError) return null
  return (
    <section aria-label="Hồi đáp và bản nháp" className="border-b border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-s-2 border-[var(--accent)] px-4 py-2 sm:px-5">
        <h2 className="text-sm font-semibold">Hồi đáp và bản nháp</h2>
        {items.length > 3 && <Button type="button" variant="ghost" size="sm" className="min-h-11" aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn' : 'Xem thêm'}</Button>}
      </header>
      {query.isError && <p role="status" className="px-4 pb-3 text-sm">Chưa tải được hồi đáp. <button type="button"
        className="underline" onClick={() => void query.refetch()}>Thử lại</button></p>}
      {stop.isError && <p role="status" className="px-4 pb-3 text-sm text-[var(--error)]">Chưa lưu được thay đổi. Hãy thử lại.</p>}
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {(expanded ? items : items.slice(0, 3)).map(item => <li key={item.id} className="px-4 py-3 sm:px-5">
          <p className="text-xs font-medium text-[var(--foreground-secondary)]">{labels[item.status]}</p>
          <p className="mt-1 break-words text-sm font-semibold">{item.subject}</p>
          <p className="mt-1 break-all text-xs text-[var(--foreground-secondary)]">{item.account}</p>
          {item.quote && <blockquote className="mt-2 break-words border-s-2 border-[var(--border)] ps-2 text-sm">{item.quote}</blockquote>}
          <div className="mt-1 flex flex-wrap items-center gap-x-4">
            <Link href={item.replyId ? '/inbox?email=' + item.replyId : replyHref(item.sourceId)} prefetch={false}
              className="neo-target inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4">
              {item.replyId ? 'Mở thư hồi đáp' : item.status === 'draft' ? 'Mở bản nháp' : 'Mở hội thoại'}
            </Link>
            {(item.status === 'reply' || item.status === 'waiting') && <Button type="button" variant="ghost" size="sm"
              className="min-h-11" disabled={stop.isPending} onClick={() => stop.mutate(item.id)}>
              {item.status === 'reply' ? 'Đã xem' : 'Ngừng theo dõi'}
            </Button>}
          </div>
        </li>)}
      </ul>
    </section>
  )
}
