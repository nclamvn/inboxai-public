'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Pencil } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { deliveryLabel } from '@/lib/commitments/delivery'
import { subjectReference } from '@/lib/commitments/detect'
import { receivingTotals, receivingValue } from '@/lib/commitments/receiving'
import { WarehouseTotals } from './warehouse-reconciliation'
import { cn } from '@/lib/utils'
import {
  commitmentsHref, fieldLabels, formatCommitmentDue, formatCommitmentMoment, ownerLabel, revisionLabels,
  statusLabels, validCommitmentId, type CommitmentGroup, type LedgerDetail, type LedgerRevision, type LedgerState,
} from '@/lib/commitments/view'

function revisionValue(state: LedgerState, field: keyof LedgerState) {
  if (field === 'delivery') return state.delivery ? deliveryLabel(state.delivery) : 'Chưa ghi nhận'
  if (field === 'receiving') return receivingValue(state)
  if (field === 'status') return statusLabels[state.status]
  if (field === 'dueOn' || field === 'dueAt') return formatCommitmentDue(state)
  if (field === 'review') return state.review?.note ?? 'Đã xác nhận'
  return state[field] ?? 'Chưa rõ'
}

function Revision({ item, previous }: { item: LedgerRevision; previous?: LedgerRevision }) {
  const fields = [...new Set(item.changedFields.map(field => field === 'dueAt' ? 'dueOn' as const : field))]
  return (
    <li className="relative border-s border-[var(--border-strong)] pb-5 ps-4 last:border-transparent last:pb-0">
      <span aria-hidden="true" className="absolute start-[-4px] top-2 size-2 rounded-full bg-[var(--selection-line)]" />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{revisionLabels[item.kind]}</h3>
        <span className="text-xs text-[var(--foreground-muted)]">Phiên bản {item.version}</span>
        <time dateTime={item.recordedAt} className="text-xs tabular-nums text-[var(--foreground-muted)]">
          {formatCommitmentMoment(item.recordedAt)}
        </time>
      </div>
      {item.kind === 'created' ? (
        <p className="mt-2 break-words text-sm text-[var(--foreground-secondary)]">
          {ownerLabel(item.state)} · {formatCommitmentDue(item.state)}
        </p>
      ) : fields.length > 0 ? (
        <dl className="mt-2 space-y-1">
          {fields.map(field => (
            <div key={field} className="grid gap-x-2 text-sm sm:grid-cols-[minmax(104px,auto)_1fr]">
              <dt className="text-[var(--foreground-muted)]">{field === 'dueOn' ? 'Hạn chót' : fieldLabels[field]}</dt>
              <dd className="min-w-0 break-words text-[var(--foreground-secondary)]">
                {previous && <><span>{revisionValue(previous.state, field)}</span><span aria-label="đổi thành"> → </span></>}
                <span className="font-medium text-[var(--foreground)]">{revisionValue(item.state, field)}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">Cập nhật email nguồn.</p>
      )}
      <ul aria-label="Email nguồn" className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {item.sources.map((source, index) => (
          <li key={`${source.emailId}-${index}`} className="min-w-0 py-2">
            {source.href && validCommitmentId(source.emailId) ? (
              <Link prefetch={false} href={`/inbox?email=${encodeURIComponent(source.emailId)}`}
                className="neo-target inline-flex min-w-0 items-center gap-2 py-1 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-2">
                <FileText size={16} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 break-words">{source.subject || 'Mở email nguồn'}</span>
              </Link>
            ) : (
              <p className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                <FileText size={16} aria-hidden="true" className="shrink-0" /> Email nguồn không còn khả dụng
              </p>
            )}
            {source.availability === 'changed' && <p className="text-xs text-[var(--warning)]">Nội dung email đã thay đổi.</p>}
            {source.quote && <blockquote className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--foreground-secondary)]">{source.quote}</blockquote>}
          </li>
        ))}
      </ul>
    </li>
  )
}

interface Props {
  detail: LedgerDetail
  history: LedgerRevision[]
  group: CommitmentGroup
  savedVersion: number | null
  onConfirm: () => void
  onReceiving: (mode: 'configure' | 'close') => void
  hasMore: boolean
  loadingMore: boolean
  historyError: boolean
  onLoadHistory: () => void
}

export function CommitmentDetail({
  detail, history, group, savedVersion, onConfirm, onReceiving, hasMore, loadingMore, historyError, onLoadHistory,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const { state } = detail
  const totals = receivingTotals(state)
  const reference = state.delivery
    ? history.flatMap(revision => revision.sources).map(source => subjectReference(source.subject)).find(code => code?.startsWith('PO-'))
    : detail.referenceKey
  return (
    <section aria-labelledby="commitment-heading" className="min-h-full min-w-0 bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-4 pb-5 pt-3 sm:px-6">
        <Link href={commitmentsHref(group)} scroll={false} prefetch={false}
          className="neo-target inline-flex min-h-8 items-center gap-2 text-sm text-[var(--accent-foreground)] lg:hidden">
          <ArrowLeft size={16} aria-hidden="true" /> Về danh sách
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-52">
            {reference && <p className="break-all text-xs text-[var(--foreground-muted)]">{reference}</p>}
            <h2 id="commitment-heading" ref={heading} tabIndex={-1} className="mt-1 break-words text-xl font-semibold leading-7 sm:text-2xl">
              {state.title}
            </h2>
          </div>
          <Button type="button" variant="outline" onClick={onConfirm} disabled={savedVersion !== null && savedVersion > detail.version}
            leftIcon={<Pencil size={16} aria-hidden="true" />}>
            Xác nhận thay đổi
          </Button>
        </div>
        {savedVersion !== null && (
          <p role="status" className="mt-3 text-sm font-medium text-[var(--success)]">Đã xác nhận phiên bản {savedVersion}.</p>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-[2fr_1.4fr_1fr]">
          <div className="min-w-0">
            <dt className="text-xs text-[var(--foreground-muted)]">Người phụ trách</dt>
            <dd className="mt-1 break-words text-sm font-medium">{ownerLabel(state)}</dd>
            {state.ownerEmail && state.ownerName && <dd className="break-all text-xs text-[var(--foreground-muted)]">{state.ownerEmail}</dd>}
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--foreground-muted)]">{state.delivery ? 'Hạn giao đã chốt' : 'Hạn chót'}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{formatCommitmentDue(state)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--foreground-muted)]">Trạng thái</dt>
            <dd className={cn('mt-1 text-sm font-medium', state.status === 'completed' && 'text-[var(--success)]')}>{statusLabels[state.status]}</dd>
          </div>
        </dl>
        {state.delivery && !totals && <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-s-2 border-[var(--selection-line)] ps-3">
          <span className="text-sm text-[var(--foreground-secondary)]">Nhà cung cấp báo đã giao</span>
          <span className="font-semibold tabular-nums">{deliveryLabel(state.delivery)}</span>
        </div>}
        {state.delivery && reference && state.status !== 'cancelled' && (
          <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold">Đối soát nhập kho</h3>
            {totals ? <>
              <WarehouseTotals state={state} />
              <p className="break-all text-xs text-[var(--foreground-muted)]">Nguồn xác nhận kho {state.receiving?.sender}</p>
              {totals.received > 0 && totals.discrepancy > 0 && <p className="text-sm font-medium text-[var(--warning)]">Kho ghi nhận ít hơn số nhà cung cấp báo giao.</p>}
              {state.status === 'open' && totals.short === 0 && totals.reported === totals.ordered && !state.review &&
                <Button type="button" loading={hasMore && loadingMore}
                  onClick={hasMore ? onLoadHistory : () => onReceiving('close')}>
                  {hasMore ? 'Tải thêm bằng chứng để khép' : 'Xem trước và khép cam kết'}
                </Button>}
            </> : <Button type="button" variant="outline" onClick={() => onReceiving('configure')}>Thiết lập nguồn nhập kho</Button>}
          </div>
        )}
        {state.review && (
          <Alert variant="warning" title={state.review.kind === 'conflicting' ? 'Có nguồn mâu thuẫn' : 'Còn điểm chưa rõ'} className="mt-4 break-words">
            {state.review.note}
          </Alert>
        )}
      </header>
      <section aria-labelledby="history-heading" className="px-4 py-5 sm:px-6">
        <h3 id="history-heading" className="text-base font-semibold">Lịch sử</h3>
        <ol className="ms-1 mt-4">
          {history.map((item, index) => (
            <Revision key={item.version} item={item} previous={history[index + 1]?.version === item.version - 1 ? history[index + 1] : undefined} />
          ))}
        </ol>
        {(hasMore || historyError) && (
          <div className="mt-5">
            {historyError && <p role="status" className="mb-2 text-sm text-[var(--error)]">Chưa cập nhật được lịch sử.</p>}
            <Button type="button" variant="outline" loading={loadingMore} onClick={onLoadHistory}>
              {historyError ? 'Thử tải lại lịch sử' : 'Tải thêm lịch sử'}
            </Button>
          </div>
        )}
      </section>
    </section>
  )
}
