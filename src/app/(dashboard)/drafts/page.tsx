'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, FileText, Forward, Paperclip, Pencil, Reply } from 'lucide-react'
import { offlineHome, useOfflineWorkspace } from '@/components/offline/offline-provider'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { composeRequest, fileDraftHref } from '@/lib/compose/client'
import { formatCommitmentMoment } from '@/lib/commitments/view'

type Draft = {
  id: string
  sourceId: string | null
  account: string
  updatedAt: string
  subject: string
  to: string
  files: number
  kind: 'new' | 'reply' | 'forward'
  state: 'draft' | 'prepared' | 'dispatching' | 'unknown' | 'rejected'
}
type DraftPage = { items: Draft[]; more: boolean }
type DraftAccount = { id: string; email_address: string }
const kinds = {
  new: { label: 'Thư mới', Icon: FileText },
  reply: { label: 'Trả lời', Icon: Reply },
  forward: { label: 'Chuyển tiếp', Icon: Forward },
}
const states = {
  draft: 'Đã lưu', prepared: 'Đã duyệt', dispatching: 'Chờ xác minh', unknown: 'Chờ xác minh', rejected: 'Gửi bị từ chối',
}

export default function DraftsPage() {
  const owner = useOfflineWorkspace()?.owner
  const [account, setAccount] = useState('')
  const [cursors, setCursors] = useState<Pick<Draft, 'id' | 'updatedAt'>[]>([])
  const cursor = cursors.at(-1)
  const params = new URLSearchParams()
  if (account) params.set('account', account)
  if (cursor) {
    params.set('before', cursor.updatedAt)
    params.set('beforeId', cursor.id)
  }
  const accounts = useQuery({
    queryKey: ['draft-accounts', owner],
    enabled: !!owner,
    queryFn: ({ signal }) => composeRequest<{ accounts: DraftAccount[] }>('/api/source-accounts', { signal }),
  })
  const drafts = useQuery({
    queryKey: ['mail-drafts', owner, params.toString()],
    enabled: !!owner,
    staleTime: 0,
    queryFn: ({ signal }) => composeRequest<DraftPage>('/api/drafts?' + params.toString(), { signal }),
  })
  const items = drafts.data?.items ?? []

  return <section aria-labelledby="drafts-heading" className="mx-auto min-h-full w-full max-w-5xl border-x border-[var(--border)] bg-[var(--surface)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
      <h1 id="drafts-heading" className="neo-title">Bản nháp</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={offlineHome} className="neo-target inline-flex items-center text-sm underline">Bản nháp trên thiết bị</Link>
        <Link href="/compose" className="neo-target inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--primary)] px-3 text-sm font-medium text-[var(--primary-foreground)] focus-ring hover:bg-[var(--primary-hover)]">
          <Pencil size={16} aria-hidden="true" /> Soạn thư
        </Link>
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6">
      <label htmlFor="draft-account" className="text-sm font-medium">Tài khoản gửi</label>
      <select id="draft-account" value={account} onChange={event => { setAccount(event.target.value); setCursors([]) }}
        className="neo-target min-h-10 min-w-0 max-w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm focus-ring">
        <option value="">Tất cả tài khoản</option>
        {accounts.data?.accounts.map(value => <option value={value.id} key={value.id}>{value.email_address}</option>)}
      </select>
      {accounts.isError && <Button variant="outline" type="button" onClick={() => void accounts.refetch()}>Tải lại tài khoản</Button>}
    </div>
    {drafts.isPending && <p role="status" className="px-4 py-6 text-sm sm:px-6">Đang mở bản nháp…</p>}
    {drafts.isError && <div className="px-4 py-4 sm:px-6"><Alert variant="error" title="Chưa mở được danh sách bản nháp">
      <Button variant="outline" type="button" onClick={() => void drafts.refetch()}>Thử lại</Button>
    </Alert></div>}
    {drafts.isSuccess && items.length === 0 && <p className="px-4 py-6 text-sm text-[var(--foreground-secondary)] sm:px-6">Chưa có bản nháp.</p>}
    {items.length > 0 && <ul aria-label="Bản nháp đã lưu" className="divide-y divide-[var(--border)]">
      {items.map(draft => {
        const { label, Icon } = kinds[draft.kind]
        const href = draft.kind === 'reply' && draft.sourceId ? '/compose?reply=' + encodeURIComponent(draft.sourceId) : fileDraftHref(draft.id)
        return <li key={draft.id}>
          <Link href={href} prefetch={false} className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 focus-ring hover:bg-[var(--hover)] sm:px-6">
            <Icon size={18} aria-hidden="true" className="mt-1 text-[var(--accent-foreground)]" />
            <div className="min-w-0 space-y-1">
              <p className="break-words text-sm font-semibold">{draft.subject || 'Thư chưa có tiêu đề'}</p>
              <p className="break-words text-sm text-[var(--foreground-secondary)]">{draft.to || 'Chưa có người nhận'}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--foreground-secondary)]">
                <span>{label}</span>
                <span className="break-all">{draft.account}</span>
                <span>{states[draft.state]}</span>
                {draft.files > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={14} aria-hidden="true" />{draft.files} tệp</span>}
                <time dateTime={draft.updatedAt}>{formatCommitmentMoment(draft.updatedAt)}</time>
              </div>
            </div>
            <ArrowRight size={16} aria-hidden="true" className="mt-1 text-[var(--foreground-secondary)]" />
          </Link>
        </li>
      })}
    </ul>}
    {(drafts.data?.more || cursors.length > 0) && <nav aria-label="Trang bản nháp" className="flex gap-2 border-t border-[var(--border)] px-4 py-3 sm:px-6">
      <Button type="button" variant="outline" disabled={!cursors.length} onClick={() => setCursors(values => values.slice(0, -1))}>Trang trước</Button>
      <Button type="button" variant="outline" disabled={!drafts.data?.more} onClick={() => setCursors(values => [...values, items[items.length - 1]])}>Trang sau</Button>
    </nav>}
  </section>
}
