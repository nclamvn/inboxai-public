'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { GmailReconnectButton, GmailReconnectNotice } from '@/components/gmail/gmail-reconnect'
import { catchupHref, type CatchupAccount } from '@/lib/commitments/catchup'
import type { AttentionItem } from '@/lib/commitments/attention'
import { approveCommitmentReminder, LedgerApiError, loadCommitmentAttention, loadCommitmentReminder } from '@/lib/commitments/client'
import { WarehouseTotals } from './warehouse-reconciliation'
import { deliveryLabel } from '@/lib/commitments/delivery'
import { commitmentsHref, formatCommitmentDue, formatCommitmentMoment, ownerLabel } from '@/lib/commitments/view'

const link = 'neo-target inline-flex min-h-11 min-w-0 items-center text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const reasons = {
  today: 'Đến hạn hôm nay',
  overdue: 'Quá hạn',
  receiving: 'Chênh lệch nhập kho',
  receiving_ready: 'Đủ hàng · Chờ khép',
  review: 'Bằng chứng cần kiểm tra',
  reply: 'Có phản hồi mới',
}
const reasonTones: Record<AttentionItem['reason'], BadgeProps['variant']> = {
  today: 'warning', overdue: 'error', review: 'warning', receiving: 'warning', receiving_ready: 'success', reply: 'info',
}
const reminderLabels = {
  accepted: 'Đã gửi lời nhắc',
  dispatching: 'Đang xử lý lời nhắc',
  unknown: 'Chưa rõ kết quả gửi',
  partial: 'Chỉ gửi được một phần',
  rejected: 'Lời nhắc chưa gửi được',
}

function ReminderReview({ item, userId, onClose, onChange }: {
  item: AttentionItem; userId: string; onClose: () => void; onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null)
  const pending = useRef(false)
  const request = useQuery({
    queryKey: ['commitments', userId, 'reminder-preview', item.id, item.version],
    queryFn: ({ signal }) => loadCommitmentReminder(item.id, signal),
    retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    staleTime: Infinity, gcTime: 0,
  })
  const preview = request.data

  async function approve() {
    if (!preview || preview.version !== item.version || pending.current || sent || failure?.retry === false) return
    pending.current = true
    setBusy(true)
    setFailure(null)
    try {
      const result = await approveCommitmentReminder(item.id, {
        version: preview.version, accountId: preview.accountId, proof: preview.proof,
      })
      if (result.state === 'accepted') setSent(true)
      else setFailure({ message: reminderLabels[result.state], retry: ['dispatching', 'unknown'].includes(result.state) })
    } catch (error) {
      const known = error instanceof LedgerApiError && error.status < 500
      setFailure({ message: known ? error.message : 'Chưa nhận được biên nhận. Kiểm tra lại cùng lời nhắc.', retry: !known })
    } finally {
      pending.current = false
      setBusy(false)
      onChange()
    }
  }

  const close = () => {
    if (!pending.current) { onChange(); onClose() }
  }

  return (
    <Modal open title="Xem trước lời nhắc" description={item.state.title} onClose={close} size="lg"
      showCloseButton={!busy} closeOnEscape={!busy} closeOnOverlayClick={false}
      footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={close}>Đóng</Button>
        {preview?.version === item.version && !sent && failure?.retry !== false && (
          <Button type="button" loading={busy} onClick={() => void approve()}>
            {failure?.retry || item.reminderState ? 'Kiểm tra kết quả gửi' : 'Xác nhận và gửi lời nhắc'}
          </Button>
        )}
      </>}>
      {request.isPending && <p role="status" className="text-sm">Đang lấy bằng chứng và nội dung lời nhắc…</p>}
      {request.isError && (
        <Alert variant="error" title="Chưa mở được lời nhắc">
          {request.error instanceof LedgerApiError ? request.error.message : 'Kiểm tra kết nối rồi mở lại lời nhắc.'}
        </Alert>
      )}
      {preview?.version !== undefined && preview.version !== item.version && (
        <Alert variant="error" title="Cam kết vừa thay đổi">Đóng bản xem trước và kiểm tra cam kết mới.</Alert>
      )}
      {preview?.version === item.version && (
        <div className="space-y-4">
          <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
            {[
              ['Từ', preview.fromAddress],
              ['Đến', preview.to],
              ['Tiêu đề', preview.subject],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 py-2">
                <dt className="text-[var(--foreground-secondary)]">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{preview.text}</p>
          <blockquote className="border-s-2 border-[var(--selection-line)] ps-3 text-sm break-words">{preview.source.quote}</blockquote>
          {preview.source.href && <Link className={link} href={preview.source.href} prefetch={false}>Mở email dùng để nhắc</Link>}
        </div>
      )}
      {sent && <Alert variant="success" title="Đã gửi lời nhắc">Máy chủ gửi đã chấp nhận thư.</Alert>}
      {failure && <Alert variant={failure.retry ? 'warning' : 'error'}>{failure.message}</Alert>}
    </Modal>
  )
}

function syncStatus(account: CatchupAccount): { label: string; tone: BadgeProps['variant'] } {
  if (account.status === 'reconnect') return { label: 'Cần kết nối lại Gmail', tone: 'error' }
  if (account.status === 'error') return { label: 'Gián đoạn · chờ thử lại', tone: 'warning' }
  if (account.status === 'syncing' || account.status === 'pending') return { label: 'Đang bắt kịp', tone: 'info' }
  if (!account.lastSyncAt) return { label: 'Chưa đồng bộ', tone: 'secondary' }
  if (account.waitingAnalysis) return { label: 'Đang kiểm tra cam kết', tone: 'info' }
  return { label: 'Đã đồng bộ', tone: 'success' }
}

function CatchupStatus({ userId, accounts, filter, onSynced }: {
  userId: string; accounts: CatchupAccount[]; filter: string[]; onSynced: () => void
}) {
  const cache = useQueryClient()
  const needsReconnect = accounts.some(account => account.status === 'reconnect')
  const interrupted = accounts.some(account => account.status === 'error')
  const sync = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error('Offline')
      const result = await fetch('/api/source-accounts/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: true }), signal: AbortSignal.timeout(60_000),
      })
      if (!result.ok) throw new Error('Sync unavailable')
      return result.json()
    },
    onSuccess: onSynced,
    onSettled: () => {
      void cache.invalidateQueries({ predicate: ({ queryKey }) =>
        queryKey[0] === 'emails' || (queryKey[0] === 'commitments' && queryKey[1] === userId &&
          (queryKey[2] === 'attention' || queryKey[2] === 'catchup')),
      })
    },
  })
  return (
    <div className="border-t border-[var(--border)] px-4 sm:px-5">
      <GmailReconnectNotice />
      <div className="flex flex-wrap items-center gap-x-5">
        <Link className={link} href={catchupHref('waiting', filter)} prefetch={false}>Xem toàn bộ việc chờ xử lý</Link>
        {accounts.length > 0 && (
          <details className="min-w-0 text-sm">
            <summary className="neo-target min-h-11 cursor-pointer list-item py-3 text-[var(--foreground-secondary)]">
              Trạng thái đồng bộ{needsReconnect ? <span className="font-medium text-[var(--error)]"> · Cần kết nối lại</span>
                : interrupted ? <span className="font-medium text-[var(--warning)]"> · Có gián đoạn</span> : null}
            </summary>
            <ul className="space-y-2 pb-2 text-xs">
              {accounts.map(account => {
                const status = syncStatus(account)
                return (
                  <li key={account.id} className="min-w-0 break-words">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 font-medium">{account.email}</span>
                      <Badge variant={status.tone} className="py-0.5">{status.label}</Badge>
                    </div>
                    {account.lastSyncAt && <p className="mt-1 text-[var(--foreground-muted)]">Lần hoàn tất gần nhất {formatCommitmentMoment(account.lastSyncAt)}</p>}
                    {account.waitingAnalysis > 0 && <p className="text-[var(--foreground-muted)]">{account.waitingAnalysis} thư chờ kiểm tra</p>}
                    {account.status === 'reconnect' && <GmailReconnectButton accountId={account.id} email={account.email} surface="inbox" />}
                  </li>
                )
              })}
            </ul>
            <Button type="button" variant="outline" size="sm" className="mb-3 min-h-11" loading={sync.isPending}
              onClick={() => sync.mutate()}>Đồng bộ ngay</Button>
            {sync.isError && <p role="status" className="pb-3 text-xs text-[var(--error)]">Chưa kết nối được. Hãy thử lại.</p>}
          </details>
        )}
      </div>
    </div>
  )
}

export function CommitmentAttention({ userId, accounts, onSynced }: {
  userId: string; accounts: string[]; onSynced: () => void
}) {
  const title = useId()
  const [review, setReview] = useState<AttentionItem | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const query = useQuery({
    queryKey: ['commitments', userId, 'attention', ...accounts],
    queryFn: ({ signal }) => loadCommitmentAttention(accounts, signal),
    staleTime: 30_000, refetchOnMount: 'always', refetchInterval: 60_000, retry: false,
  })
  const items = query.data?.items ?? []
  const status = query.data?.accounts ?? []
  const refresh = () => void query.refetch()

  if (!items.length && !status.length && !query.isError && !review) return null
  return (
    <>
      {(items.length > 0 || status.length > 0 || query.isError) && (
        <section aria-labelledby={title} className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="neo-section-accent flex min-w-0 items-center justify-between gap-3 px-4 sm:px-5">
            <h2 id={title} ref={heading} tabIndex={-1} className="py-3 text-sm font-semibold">Cam kết cần chú ý</h2>
            <button type="button" onClick={refresh} className="neo-icon-button" disabled={query.isFetching}
              aria-label="Làm mới cam kết cần chú ý" title="Làm mới cam kết cần chú ý">
              <RotateCw size={16} aria-hidden="true" />
            </button>
          </div>
          {query.isError && <p role="status" className="px-4 pb-3 text-sm text-[var(--error)]">Chưa cập nhật được cam kết. Thử làm mới.</p>}
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {items.map(item => {
              const eligible = (item.reason === 'today' || item.reason === 'overdue' || item.reason === 'receiving') && item.responsibility === 'waiting'
              const unresolved = item.reminderState === 'unknown' || item.reminderState === 'dispatching'
              return (
                <li key={item.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-5 px-4 pt-3 sm:px-5">
                  <div className="min-w-0 flex-[1_1_15rem]">
                    <p className="break-words text-sm font-semibold">{item.state.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--foreground-secondary)]">
                      <Badge variant={reasonTones[item.reason]} className="py-0.5">{reasons[item.reason]}</Badge>
                      <span>{formatCommitmentDue(item.state)} · {item.responsibility === 'mine' ? 'Tôi phải làm' : ownerLabel(item.state)}</span>
                    </div>
                    {item.state.receiving && <div className="mt-2"><WarehouseTotals state={item.state} /></div>}
                    {item.state.delivery && !item.state.receiving && <p className="mt-1 text-sm tabular-nums">Nhà cung cấp báo đã giao {deliveryLabel(item.state.delivery)}</p>}
                    {item.reply && <blockquote className="mt-2 border-s-2 border-[var(--border)] ps-2 text-sm break-words">{item.reply.quote}</blockquote>}
                    <div className="flex flex-wrap items-center gap-x-4">
                      {item.source.href && <Link className={link} href={item.source.href} prefetch={false}>Mở email nguồn</Link>}
                      <Link className={link} href={commitmentsHref(item.group, item.id)} prefetch={false}>{item.reason === 'receiving_ready' ? 'Xem và khép cam kết' : 'Xem lịch sử'}</Link>
                      {item.reply && (
                        <Link className={link} href={catchupHref(item.group, accounts, item.reply.emailId)} prefetch={false}>
                          {item.reply.needsReview ? 'Kiểm tra phản hồi' : 'Xem đề xuất cập nhật'}
                        </Link>
                      )}
                    </div>
                  </div>
                  {(item.reminderState || eligible) && (
                    <div className="pb-3 pt-1">
                      {eligible && (!item.reminderState || unresolved) ? (
                        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={event => {
                          opener.current = event.currentTarget
                          setReview(item)
                        }}>
                          {unresolved ? 'Kiểm tra lời nhắc' : 'Xem trước lời nhắc'}
                        </Button>
                      ) : item.reminderState && <p role="status" className="text-xs text-[var(--foreground-secondary)]">{reminderLabels[item.reminderState]}</p>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <CatchupStatus userId={userId} accounts={status} filter={accounts} onSynced={onSynced} />
        </section>
      )}
      {review && (
        <ReminderReview key={review.id + ':' + review.version} item={review} userId={userId} onChange={refresh} onClose={() => {
          setReview(null)
          if (!opener.current?.isConnected) (heading.current ?? document.getElementById('main-content'))?.focus()
        }} />
      )}
    </>
  )
}
