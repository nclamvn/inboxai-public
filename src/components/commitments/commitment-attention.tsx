'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { AttentionItem } from '@/lib/commitments/attention'
import { approveCommitmentReminder, LedgerApiError, loadCommitmentAttention, loadCommitmentReminder } from '@/lib/commitments/client'
import { commitmentsHref, formatCommitmentDue, ownerLabel } from '@/lib/commitments/view'

const link = 'neo-target inline-flex min-h-11 min-w-0 items-center text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const reasons = {
  today: 'Đến hạn hôm nay',
  overdue: 'Quá hạn',
  review: 'Bằng chứng cần kiểm tra',
  reply: 'Có phản hồi mới',
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

export function CommitmentAttention({ userId, accounts }: { userId: string; accounts: string[] }) {
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
  const refresh = () => void query.refetch()

  if (!items.length && !query.isError && !review) return null
  return (
    <>
      {(items.length > 0 || query.isError) && (
        <section aria-labelledby={title} className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex min-w-0 items-center justify-between gap-3 border-s-2 border-[var(--selection-line)] px-4 sm:px-5">
            <h2 id={title} ref={heading} tabIndex={-1} className="py-3 text-sm font-semibold">Cam kết cần chú ý</h2>
            <button type="button" onClick={refresh} className="neo-icon-button" disabled={query.isFetching}
              aria-label="Làm mới cam kết cần chú ý" title="Làm mới cam kết cần chú ý">
              <RotateCw size={16} aria-hidden="true" />
            </button>
          </div>
          {query.isError && <p role="status" className="px-4 pb-3 text-sm text-[var(--error)]">Chưa cập nhật được cam kết. Thử làm mới.</p>}
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {items.map(item => {
              const eligible = (item.reason === 'today' || item.reason === 'overdue') && item.responsibility === 'waiting'
              const unresolved = item.reminderState === 'unknown' || item.reminderState === 'dispatching'
              return (
                <li key={item.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-5 px-4 pt-3 sm:px-5">
                  <div className="min-w-0 flex-[1_1_15rem]">
                    <p className="break-words text-sm font-semibold">{item.state.title}</p>
                    <p className="mt-1 break-words text-xs text-[var(--foreground-secondary)]">
                      {reasons[item.reason]} · {formatCommitmentDue(item.state)} · {item.responsibility === 'mine' ? 'Tôi phải làm' : ownerLabel(item.state)}
                    </p>
                    {item.reply && <blockquote className="mt-2 border-s-2 border-[var(--border)] ps-2 text-sm break-words">{item.reply.quote}</blockquote>}
                    <div className="flex flex-wrap items-center gap-x-4">
                      {item.source.href && <Link className={link} href={item.source.href} prefetch={false}>Mở email nguồn</Link>}
                      <Link className={link} href={commitmentsHref(item.group, item.id)} prefetch={false}>Xem lịch sử</Link>
                      {item.reply && (
                        <Link className={link} href={commitmentsHref(item.group) + '&view=proposals&source=' + item.reply.emailId} prefetch={false}>
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
