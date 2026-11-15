'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { EmailSnoozeDialog } from '@/components/email/email-snooze-dialog'
import { useEmails } from '@/hooks/use-emails'
import type { Email } from '@/types'

const localDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })

export default function SnoozedPage() {
  const { emails, loading, error, refetch, hasMore, pageError, loadingMore, loadMore } = useEmails({ folder: 'snoozed' })
  const [accounts, setAccounts] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<{ email: Email; mode: 'move' | 'cancel' } | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/source-accounts', { signal: controller.signal }).then(async response => {
      if (!response.ok) return
      const data = await response.json() as { accounts?: { id: string; email_address: string }[] }
      if (!controller.signal.aborted) setAccounts(Object.fromEntries((data.accounts ?? []).map(account => [account.id, account.email_address])))
    }).catch(() => {})
    return () => controller.abort()
  }, [])

  return <div className="min-h-full bg-[var(--surface)]">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-4 sm:px-5">
      <h1 className="neo-title">Đã hẹn</h1>
      <Link href="/inbox" className="neo-target inline-flex min-h-11 items-center px-2 text-sm text-[var(--accent-foreground)] underline">Về hộp thư</Link>
    </header>
    {notice && <p role="status" className="px-4 pt-3 text-sm text-[var(--foreground-secondary)]">{notice}</p>}
    {loading ? <p role="status" className="px-4 py-6 text-sm">Đang tải lịch hẹn…</p>
      : error && emails.length === 0 ? <EmptyState type="error" title="Chưa tải được lịch hẹn" action={{ label: 'Tải lại', onClick: refetch }} />
      : emails.length === 0 ? <EmptyState type="empty-folder" title="Chưa có thư đã hẹn" description="Các thư bạn hẹn xử lý sẽ xuất hiện ở đây." />
      : <>
        {error && <div role="alert" className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
          Chưa cập nhật được lịch hẹn.
          <Button variant="outline" size="sm" onClick={refetch}>Tải lại</Button>
        </div>}
        <ul aria-label="Thư đã hẹn xử lý" className="divide-y divide-[var(--border)]">
          {emails.map(email => <li key={email.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1 basis-48 break-words [overflow-wrap:anywhere]">
              <Link href={`/inbox?email=${email.id}`} className="focus-ring font-semibold text-[var(--accent-foreground)] hover:underline">
                {email.subject ?? '(Không có tiêu đề)'}
              </Link>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">{email.source_account_id
                ? accounts[email.source_account_id] ?? email.from_address : email.from_address}</p>
              {email.snoozed_until && <time dateTime={email.snoozed_until}
                className="mt-2 flex items-center gap-2 text-sm tabular-nums">
                <Clock size={16} aria-hidden="true" /> {localDate.format(new Date(email.snoozed_until))}
              </time>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditing({ email, mode: 'move' })}>Dời hẹn</Button>
              <Button variant="ghost" onClick={() => setEditing({ email, mode: 'cancel' })}>Hủy hẹn</Button>
            </div>
          </li>)}
        </ul>
        {hasMore && <div className="px-4 py-3">
          <Button variant="outline" loading={loadingMore} onClick={loadMore}>{pageError ? 'Thử tải thêm' : 'Tải thêm'}</Button>
        </div>}
      </>}
    {editing && <EmailSnoozeDialog email={editing.email} mode={editing.mode} onClose={() => setEditing(null)}
      onSaved={until => setNotice(until ? 'Đã dời lịch xử lý.' : 'Đã hủy lịch xử lý.')} />}
  </div>
}
