'use client'

import Link from 'next/link'
import { useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LedgerApiError } from '@/lib/commitments/client'
import { batchHref } from '@/lib/commitments/purchase-batch'
import { handoffHref } from '@/lib/commitments/purchase-handoff'
import { formatVnd } from '@/lib/commitments/purchase-payment'
import { settlementReceipt, type SettlementCommand, type SettlementPreview, type SettlementReceipt,
  type SettlementScope, type SettlementSummary } from '@/lib/commitments/purchase-settlement'

const endpoint = '/api/commitments/settlements'
const link = 'neo-target inline-flex min-h-11 items-center gap-2 break-words text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const labels = {
  waiting: 'Chờ thanh toán', partial: 'Đã trả một phần', paid: 'Đã thanh toán', review: 'Cần đối soát lại',
  reopened: 'Công nợ mở lại',
}

async function readSettlement<T>(params: URLSearchParams, signal: AbortSignal): Promise<T> {
  return responseJson(await fetch(endpoint + '?' + params, { signal, cache: 'no-store' }))
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new LedgerApiError(response.status, body?.error ?? 'Chưa đọc được chứng từ thanh toán.')
  return body as T
}

function Totals({ amounts }: { amounts: [label: string, amount: number][] }) {
  return <dl className="grid grid-cols-1 divide-y divide-[var(--border)] border-y border-[var(--border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
    {amounts.map(([label, amount], index) => <div key={label} className="flex justify-between gap-4 px-3 py-2 sm:block sm:py-3">
      <dt className="text-sm text-[var(--foreground-muted)]">{label}</dt>
      <dd className={'text-base tabular-nums sm:mt-1 ' + (index === amounts.length - 1 ? 'font-semibold' : 'font-medium')}>{formatVnd(amount)}</dd>
    </div>)}
  </dl>
}

export function PurchaseSettlementBalance({ userId, scope }: { userId: string; scope: SettlementScope }) {
  const heading = useId()
  const query = useQuery({
    queryKey: ['commitments', userId, 'settlement', scope],
    queryFn: ({ signal }) => readSettlement<SettlementSummary>(new URLSearchParams(scope), signal),
    retry: false,
    refetchOnMount: true,
    refetchInterval: 30_000,
  })
  const data = query.data
  if (data?.status === 'unapproved') return null
  return <section aria-labelledby={heading} className="space-y-3 border-t border-[var(--border)] pt-4">
    <div className="flex flex-wrap items-center gap-3">
      <h2 id={heading} className="text-sm font-semibold">Theo dõi thanh toán</h2>
      {data && <Badge variant={data.status === 'paid' ? 'success' : ['review', 'reopened'].includes(data.status) ? 'warning' : 'secondary'}>{labels[data.status]}</Badge>}
    </div>
    {query.isPending && <p role="status" className="text-sm">Đang đọc số dư…</p>}
    {query.isError && <Alert variant="warning">Chưa đọc được số dư. Hãy tải lại hồ sơ.</Alert>}
    {data && <>
      <Totals amounts={[[data.status === 'review' ? 'Giá trị hóa đơn trước thuế' : 'Phải trả trước thuế', data.due],
        [data.returned > 0 ? 'Đã trả sau hoàn' : 'Đã ghi nhận', data.paid], ['Còn lại theo hóa đơn', data.remaining]]} />
      {data.status === 'review' && <Alert variant="warning">
        {data.excess > 0 ? 'Khoản đã ghi nhận vượt ' + formatVnd(data.excess) + '. Cần đối soát chênh lệch.' :
          'Hóa đơn hoặc căn cứ đã thay đổi. Các khoản đã ghi nhận vẫn có trong lịch sử.'}
      </Alert>}
      {data.status === 'reopened' && <p className="text-sm">Khoản chuyển bị hoàn. Có thể ghi chứng từ chuyển thay thế cho số còn lại.</p>}
      {data.status === 'waiting' && 'handoffId' in scope &&
        <p className="text-sm text-[var(--foreground-secondary)]">Mở tệp CSV chứng từ trong Hộp thư, rồi chọn Đối soát thanh toán.</p>}
      {data.entries.length > 0 && <ol aria-label="Chứng từ đã ghi sổ" className="divide-y divide-[var(--border)]">
        {data.entries.map(entry => <li key={entry.id} className="space-y-1 py-2 text-sm">
          <div className="flex justify-between gap-3">
            <p className="[overflow-wrap:anywhere]">{entry.kind === 'return' && 'Hoàn tiền · '}<strong>{entry.reference}</strong> · {entry.invoice}</p>
            <p className="shrink-0 tabular-nums">{formatVnd(entry.kind === 'return' ? -entry.amount : entry.amount)}</p>
          </div>
          {entry.originalTransfer && <p className="break-words text-xs">Giao dịch gốc {entry.originalTransfer}</p>}
          <p className="break-all text-xs text-[var(--foreground-muted)]"><time dateTime={entry.paidOn}>{entry.paidOn}</time> · {entry.reviewer}</p>
          {entry.emailId
            ? <Link href={'/inbox?email=' + entry.emailId} prefetch={false} className={link}>{entry.filename}</Link>
            : <p className="break-all text-xs text-[var(--foreground-muted)]">{entry.filename}</p>}
        </li>)}
      </ol>}
    </>}
  </section>
}

export function PurchaseSettlementReview({ userId, emailId, attachmentId }: { userId: string; emailId: string; attachmentId: string }) {
  const cache = useQueryClient()
  const preview = useQuery({
    queryKey: ['commitments', userId, 'settlement-preview', emailId, attachmentId],
    queryFn: ({ signal }) => readSettlement<SettlementPreview>(new URLSearchParams({ email: emailId, file: attachmentId }), signal),
    retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  const frozen = useRef<{ key: string; command: SettlementCommand } | null>(null)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<SettlementReceipt>()
  const [error, setError] = useState<{ message: string; uncertain: boolean }>()
  const data = preview.data
  const isReturn = data?.kind === 'return'
  async function save(command: SettlementCommand) {
    if (inFlight.current || saved) return
    inFlight.current = true
    const request = frozen.current ?? { key: crypto.randomUUID(), command }
    frozen.current = request
    setBusy(true)
    setError(undefined)
    try {
      const receipt = settlementReceipt.parse(await responseJson(await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.key },
        body: JSON.stringify(request.command), signal: AbortSignal.timeout(65_000),
      })))
      if (receipt.handoffId !== request.command.handoffId) throw new Error('Unexpected settlement receipt')
      setSaved(receipt)
      void cache.invalidateQueries({ queryKey: ['commitments', userId, 'settlement'] })
      void cache.invalidateQueries({ queryKey: ['commitments', userId, 'purchase-dues'] })
      void cache.invalidateQueries({ queryKey: ['commitments', userId, 'purchase-batches'] })
    } catch (failure) {
      const known = failure instanceof LedgerApiError && failure.status < 500
      if (known) frozen.current = null
      setError({ message: known ? failure.message : 'Chưa nhận được biên nhận. Hãy thử lại cùng yêu cầu.', uncertain: !known })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return <section aria-labelledby="settlement-heading" className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6">
    <Link href={'/inbox?email=' + emailId} prefetch={false} className={link}>
      <ArrowLeft size={16} aria-hidden="true" />Về email nguồn
    </Link>
    <h1 id="settlement-heading" className="border-s-2 border-[var(--accent)] ps-3 text-xl font-semibold sm:text-2xl">Đối soát thanh toán</h1>
    {preview.isPending && <p role="status" className="text-sm">Đang đọc chứng từ…</p>}
    {preview.isError && <Alert variant="warning" title="Chưa thể ghi chứng từ">{preview.error instanceof LedgerApiError
      ? preview.error.message : 'Chưa đọc được chứng từ. Hãy thử mở lại từ email nguồn.'}</Alert>}
    {data && !preview.isError && <>
      <div className="space-y-2 text-sm">
        <h2 className="font-semibold">{data.invoice} · {data.reference}</h2>
        <p className="[overflow-wrap:anywhere]">{data.filename} · {data.subject}</p>
        <p className="break-words text-[var(--foreground-muted)]">{isReturn ? 'Chứng từ hoàn' : 'Giao dịch'} {data.transfer} · <time dateTime={data.paidOn}>{data.paidOn}</time></p>
        {isReturn && <p className="break-words">Giao dịch gốc <strong>{data.originalTransfer}</strong> · {formatVnd(data.originalAmount ?? 0)}
          {data.alreadyReturned > 0 && ' · Đã hoàn ' + formatVnd(data.alreadyReturned)}</p>}
      </div>
      {data.command.batchId && <Link href={batchHref(data.command.batchId)} prefetch={false} className={link}>Mở đợt thanh toán đã duyệt</Link>}
      {saved ? <>
        <p role="status" className="text-sm font-medium">{isReturn ? 'Đã ghi chứng từ hoàn tiền.' : 'Đã ghi chứng từ thanh toán.'}</p>
        <Totals amounts={[[ 'Phải trả trước thuế', data.due ], [ isReturn ? 'Đã trả sau hoàn' : 'Đã ghi nhận', saved.paid ], [ 'Còn lại', saved.remaining ]]} />
      </> : <Totals amounts={[[ 'Đã ghi nhận', data.paid ], [ isReturn ? 'Khoản hoàn này' : 'Chứng từ này', data.amount ],
        [ isReturn ? 'Còn phải trả sau hoàn' : 'Còn lại sau khi ghi', data.remainingAfter ]]} />}
      {error && <Alert variant="warning">{error.message}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        {!saved && (!error || error.uncertain) && <Button type="button" loading={busy} disabled={preview.isFetching} onClick={() => void save(data.command)}>
          {error?.uncertain ? 'Thử lại cùng yêu cầu' : isReturn ? 'Xác nhận ghi hoàn tiền' : 'Xác nhận ghi thanh toán'}
        </Button>}
        {!saved && error && !error.uncertain && <Button type="button" variant="outline" onClick={() => {
          setError(undefined)
          void preview.refetch()
        }}>Xem lại chứng từ</Button>}
        <Link href={handoffHref(data.handoffId)} prefetch={false} className={link}>Mở hồ sơ Kế toán</Link>
      </div>
    </>}
  </section>
}
