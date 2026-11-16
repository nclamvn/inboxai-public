'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { formatCommitmentDue } from '@/lib/commitments/view'
import { readReplyWork, replyRequest } from '@/lib/replies/client'
import { replyHref, type ReplyWork } from '@/lib/replies/contracts'
import { ReplyFollowupDialog } from './reply-followup-dialog'
import { actionNotificationsKey } from '@/lib/notifications/action-contracts'
import { Clock3, MessageSquare, FilePenLine, Send, MailCheck, CircleAlert, MessagesSquare } from 'lucide-react'

const labels: Record<ReplyWork['status'], string> = {
  reply: 'Có hồi đáp', due: 'Đến hẹn', waiting: 'Đang chờ', draft: 'Bản nháp', sending: 'Cần kiểm tra lượt gửi', sent: 'Đã gửi',
}
const reminderLabels = {
  dispatching: 'Đang gửi thư nhắc', unknown: 'Chờ xác minh thư nhắc', accepted: 'Đã gửi thư nhắc',
  partial: 'Thư nhắc chỉ gửi được một phần', rejected: 'Gửi thư nhắc thất bại',
}
const workVisuals = {
  reply: { tone: 'work', Icon: MessageSquare }, due: { tone: 'important', Icon: Clock3 },
  waiting: { tone: 'personal', Icon: Clock3 }, draft: { tone: 'newsletter', Icon: FilePenLine },
  sending: { tone: 'important', Icon: Send }, sent: { tone: 'complete', Icon: MailCheck },
}

export function ReplyInbox({ userId, accounts, focus }: { userId: string; accounts: string[]; focus?: string }) {
  const cache = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [dialog, setDialog] = useState<{ item: ReplyWork; mode: 'date' | 'preview' | 'check' } | null>(null)
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['reply-work', userId] })
    void cache.invalidateQueries({ queryKey: [...actionNotificationsKey, userId] })
  }
  const query = useQuery({
    queryKey: ['reply-work', userId, ...accounts],
    queryFn: ({ signal }) => readReplyWork(accounts, signal),
    staleTime: 30_000, refetchOnMount: 'always', refetchInterval: 60_000, retry: false,
  })
  const stop = useMutation({
    mutationFn: (id: string) => replyRequest({ action: 'stop', id }),
    onSuccess: refresh,
  })
  const items = query.data ?? []
  const focused = items.find(item => item.id === focus)
  const focusedId = focused?.id
  useEffect(() => {
    if (!focusedId) return
    const row = document.getElementById('followup-' + focusedId)
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])
  if (!items.length && !query.isError) return null
  const visible = expanded ? items : focused ? [focused, ...items.filter(item => item.id !== focused.id).slice(0, 2)] : items.slice(0, 3)
  const due = visible.filter(item => item.status === 'due')
  const other = visible.filter(item => item.status !== 'due')

  function renderList(rows: ReplyWork[]) {
    return (
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {rows.map(item => {
          const verifying = item.reminderState === 'unknown' || item.reminderState === 'dispatching'
          const waiting = item.status === 'waiting' || item.status === 'due'
          const { tone, Icon } = verifying ? { tone: 'important', Icon: CircleAlert } : workVisuals[item.status]
          return <li key={item.id} id={'followup-' + item.id} tabIndex={-1}
            data-mail-tone={tone}
            className="neo-work-item scroll-mt-4 px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] sm:px-5">
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--signal-ink)]">
              <span className="neo-signal-heading" aria-hidden="true"><Icon size={15} strokeWidth={1.8} /></span>
              {labels[item.status]}
              {item.followupOn && <span> · {formatCommitmentDue({ dueOn: item.followupOn, dueAt: null })}</span>}
            </p>
            <p className="mt-1 break-words text-sm font-semibold">{item.subject}</p>
            <p className="mt-1 break-all text-xs text-[var(--foreground-secondary)]">{item.account}</p>
            {item.reminderState && <p className="mt-1 text-xs font-medium">{reminderLabels[item.reminderState]}</p>}
            {item.quote && <blockquote className="mt-2 break-words border-s-2 border-[var(--border)] ps-2 text-sm">{item.quote}</blockquote>}
            <div className="mt-1 flex flex-wrap items-center gap-x-4">
              <Link href={item.replyId ? '/inbox?email=' + item.replyId : replyHref(item.sourceId)} prefetch={false}
                className="neo-target inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4">
                {item.replyId ? 'Mở thư hồi đáp' : item.status === 'draft' ? 'Mở bản nháp' : 'Mở hội thoại'}
              </Link>
              {item.status === 'due' && <Button type="button" variant="outline" size="sm" className="min-h-11"
                onClick={() => setDialog({ item, mode: 'preview' })}>Xem trước thư nhắc</Button>}
              {verifying && <Button type="button" variant="outline" size="sm" className="min-h-11"
                onClick={() => setDialog({ item, mode: 'check' })}>Kiểm tra thư nhắc</Button>}
              {waiting && !verifying && <Button type="button" variant="ghost" size="sm" className="min-h-11"
                onClick={() => setDialog({ item, mode: 'date' })}>{item.followupOn ? 'Dời hẹn' : 'Đặt ngày kiểm tra'}</Button>}
              {(item.status === 'reply' || waiting) && !verifying && <Button type="button" variant="ghost" size="sm"
                className="min-h-11" disabled={stop.isPending} onClick={() => stop.mutate(item.id)}>
                {item.status === 'reply' ? 'Đã xử lý hồi đáp' : 'Ngừng theo dõi'}
              </Button>}
            </div>
          </li>
        })}
      </ul>
    )
  }

  return (
    <section aria-label="Hồi đáp và bản nháp" className="border-b border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-s-2 border-[var(--accent)] px-4 py-2 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><MessagesSquare size={18} className="text-[var(--accent-foreground)]" aria-hidden="true" />Hồi đáp và bản nháp</h2>
        {items.length > 3 && <Button type="button" variant="ghost" size="sm" className="min-h-11" aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn' : 'Xem thêm'}</Button>}
      </header>
      {query.isError && <p role="status" className="px-4 pb-3 text-sm">Chưa tải được hồi đáp. <button type="button"
        className="underline" onClick={() => void query.refetch()}>Thử lại</button></p>}
      {stop.isError && <p role="status" className="px-4 pb-3 text-sm text-[var(--error)]">Chưa lưu được thay đổi. Hãy thử lại.</p>}
      {due.length > 0 && <section aria-label="Cần theo dõi hôm nay">
        <h3 className="border-t border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] sm:px-5">
          Cần theo dõi hôm nay
        </h3>
        {renderList(due)}
      </section>}
      {other.length > 0 && renderList(other)}
      {dialog && <ReplyFollowupDialog item={dialog.item} mode={dialog.mode} onClose={() => setDialog(null)} onChange={refresh} />}
    </section>
  )
}
