'use client'

import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LedgerApiError } from '@/lib/commitments/client'
import { formatVnd, paymentHref } from '@/lib/commitments/purchase-payment'
import { PurchaseSettlementBalance } from './purchase-settlement'
import { dueExceptionLabel, handoffHref, handoffReceipt, type DueException, type HandoffCommand, type HandoffDetail, type HandoffEvent, type HandoffListItem,
  type HandoffOwner, type HandoffReceipt, type HandoffStatus, type SharedPaymentSnapshot } from '@/lib/commitments/purchase-handoff'

const endpoint = '/api/commitments/handoffs'
const link = 'neo-target inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const field = 'min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 py-2 text-sm'
const statusLabel: Record<HandoffStatus,string> = {
  pending:'Chờ Kế toán duyệt', stale:'Chứng từ đã đổi', returned:'Đã trả lại', superseded:'Đã có lần bàn giao mới', approved:'Đã duyệt',
}
const actions: Record<HandoffEvent['action'],string> = {
  submit:'Bàn giao', return:'Trả lại', supersede:'Thay lần bàn giao', approve:'Duyệt đủ căn cứ thanh toán',
}
const exceptionActions = { ...actions, request_evidence: 'Yêu cầu bổ sung chứng từ', submit: 'Bàn giao bản bổ sung', approve: 'Duyệt lại và khép ngoại lệ' }
const reviewReceiptCopy = {
  approve: 'Đã duyệt hồ sơ.', return: 'Đã trả lại hồ sơ.', request_evidence: 'Đã giao yêu cầu bổ sung cho Mua hàng.', submit: 'Đã bàn giao hồ sơ cho Kế toán.',
}
const time = new Intl.DateTimeFormat('vi-VN', { dateStyle:'short', timeStyle:'short', timeZone:'Asia/Ho_Chi_Minh' })

async function handoffFetch<T>(suffix = '', init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint + suffix, { ...init, cache:'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new LedgerApiError(response.status, data?.error ?? 'Chưa đọc được hồ sơ bàn giao.')
  return data as T
}

function useHandoffWrite(onComplete: (receipt: HandoffReceipt) => void) {
  const frozen = useRef<{ key: string; command: HandoffCommand } | null>(null)
  const active = useRef(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState<{ message: string; uncertain: boolean }>()
  const [receipt,setReceipt] = useState<HandoffReceipt>()
  async function submit(command: HandoffCommand) {
    if (active.current) return
    active.current = true
    setBusy(true)
    setError(undefined)
    const request = frozen.current ?? { key:crypto.randomUUID(), command }
    frozen.current = request
    try {
      const result = handoffReceipt.parse(await handoffFetch('', {
        method:'POST', headers:{ 'Content-Type':'application/json','Idempotency-Key':request.key },
        body:JSON.stringify(request.command), signal:AbortSignal.timeout(65_000),
      }))
      if (result.action!==request.command.action ||
        (request.command.action!=='submit' && result.id!==request.command.handoffId) ||
        (result.action==='approve')!==Boolean(result.decisionId)) throw new Error('Unexpected receipt')
      frozen.current = null
      setReceipt(result)
      onComplete(result)
    } catch (failure) {
      const known = failure instanceof LedgerApiError && failure.status < 500
      if (known) frozen.current = null
      setError({ message:known ? failure.message : 'Chưa nhận được biên nhận. Hãy thử lại cùng yêu cầu.', uncertain:!known })
    } finally {
      active.current = false
      setBusy(false)
    }
  }
  return { submit, retry: () => { if (frozen.current) void submit(frozen.current.command) }, busy,error,receipt }
}

function History({ events }: { events: HandoffEvent[] }) {
  if (!events.length) return null
  return <section aria-label="Lịch sử bàn giao" className="space-y-2">
    <h2 className="text-sm font-semibold">Lịch sử bàn giao</h2>
    <ol className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {events.map(event => <li key={event.id} className="space-y-1 py-3 text-sm">
        <p className="font-medium">{actions[event.action]} · {event.invoice}</p>
        <p className="break-all text-xs text-[var(--foreground-muted)]">{event.actor}{event.action==='submit' && ' → '+event.reviewer} · <time dateTime={event.at}>{time.format(new Date(event.at))}</time></p>
        {event.reason && <p className="whitespace-pre-wrap break-words">{event.reason}</p>}
      </li>)}
    </ol>
  </section>
}

function ExceptionHistory({ item }: { item: DueException }) {
  return <section aria-label="Ngoại lệ công nợ" className="space-y-3 border-t border-[var(--border)] pt-3">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-sm font-semibold">Ngoại lệ công nợ</h2>
      <Badge variant={item.stage==='closed'?'success':'warning'}>{dueExceptionLabel[item.stage]}</Badge>
    </div>
    {item.stage!=='closed' && <p className="text-sm">Tạm giữ ghi thanh toán đến khi duyệt bản bổ sung.</p>}
    <ol aria-label="Lịch sử ngoại lệ" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {item.events.map(event => <li key={event.id} className="space-y-1 py-3 text-sm">
        <p className="font-medium">{exceptionActions[event.action]} · {event.invoice}</p>
        <p className="break-all text-xs text-[var(--foreground-muted)]">
          {event.actor} · <time dateTime={event.at}>{time.format(new Date(event.at))}</time>
        </p>
        {event.reason && <p className="whitespace-pre-wrap break-words">{event.reason}</p>}
      </li>)}
    </ol>
  </section>
}

function ExceptionComparison({ item, snapshot }: { item: DueException; snapshot: SharedPaymentSnapshot }) {
  const rows = [
    { invoice: item.originInvoice, deadline: item.originDeadline, total: item.originTotal, label: 'Bản đã duyệt' },
    { invoice: snapshot.invoice.number, deadline: snapshot.invoice.lines[0]?.paymentDue, total: snapshot.subtotal, label: 'Bản bổ sung' },
  ]
  return <section aria-label="So sánh bản bổ sung" className="space-y-2">
    <h2 className="text-sm font-semibold">So sánh bản bổ sung</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(row => <div className="space-y-1 border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" key={row.invoice}>
        <p className="font-semibold">{row.label} · {row.invoice}</p>
        <p>Hạn thanh toán {row.deadline ? <time dateTime={row.deadline}>{row.deadline}</time> : 'chưa xác minh'}</p>
        {row.total !== undefined && <p>Trước thuế {formatVnd(row.total)}</p>}
      </div>)}
    </div>
  </section>
}

export function HandoffOwnerPanel({ userId, commitmentId, invoiceId, proof, setManaged }: {
  userId: string; commitmentId: string; invoiceId: string; proof?: string; setManaged: (value: boolean) => void
}) {
  const cache = useQueryClient()
  const [reviewer,setReviewer] = useState('')
  const queryKey = ['commitments',userId,'handoff-owner',commitmentId,invoiceId]
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const data = await handoffFetch<HandoffOwner>('?' + new URLSearchParams({ commitment:commitmentId, invoice:invoiceId }), { signal })
      return data
    },
    retry:false, staleTime:0, refetchOnMount:true, refetchInterval:30_000,
  })
  const write = useHandoffWrite(() => {
    setManaged(true)
    void cache.invalidateQueries({ queryKey })
    void cache.invalidateQueries({ queryKey:['commitments',userId,'purchase-dues'] })
    void cache.invalidateQueries({ queryKey:['commitments',userId,'attention'] })
  })
  const item = query.data?.exception
  const activeException = item && item.stage!=='closed' ? item : null
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (proof) void write.submit({action:'submit',commitmentId,invoiceId,proof,reviewer:activeException?.reviewer ?? reviewer})
  }

  return <section aria-label="Bàn giao cho Kế toán" className="space-y-3 border-t border-[var(--border)] pt-4">
    <h2 className="text-sm font-semibold">Bàn giao cho Kế toán</h2>
    {item && <ExceptionHistory item={item} />}
    {activeException?.latestInvoiceId && activeException.latestInvoiceId!==invoiceId &&
      <Link href={paymentHref(commitmentId,activeException.latestInvoiceId)} prefetch={false} className={link}>Mở hóa đơn đính chính</Link>}
    {activeException?.stage==='buyer' && activeException.latestInvoiceId===invoiceId && !proof &&
      <p className="text-sm">Mở email của nhà cung cấp để ghi hóa đơn đính chính cùng đợt.</p>}
    {query.data?.pending && <p className="break-all text-sm">
      Đang giao cho {query.data.pending.reviewer}. Bàn giao lại sẽ thay lần đang chờ của đợt này.
    </p>}
    {proof && query.isSuccess && <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      {activeException ? <p className="min-w-0 break-all text-sm">Kế toán phụ trách {activeException.reviewer}</p> : <label className="min-w-0 flex-[1_1_240px] space-y-1">
        <span className="text-xs font-medium">Email tài khoản Kế toán</span>
        <input type="email" autoComplete="email" maxLength={254} required value={reviewer} className={field}
          disabled={write.busy || write.error?.uncertain} onChange={event=>setReviewer(event.target.value)} />
      </label>}
      <Button type="submit" loading={write.busy} disabled={write.error?.uncertain}>
        {activeException ? 'Bàn giao bản bổ sung' : query.data?.pending ? 'Bàn giao lại' : 'Bàn giao hồ sơ'}
      </Button>
    </form>}
    {query.isError && <Alert variant="warning">Chưa tải được lịch sử bàn giao.</Alert>}
    {write.error && <Alert variant="warning"><p>{write.error.message}</p>
      {write.error.uncertain && <Button type="button" variant="outline" className="mt-2" loading={write.busy} onClick={write.retry}>Thử lại cùng yêu cầu</Button>}
    </Alert>}
    {write.receipt && <p role="status" className="text-sm">Đã bàn giao hồ sơ cho Kế toán.</p>}
    <History events={query.data?.history ?? []} />
  </section>
}

function File({ id, attachment, filename, row }: { id: string; attachment: string; filename: string; row: number }) {
  return <a href={endpoint+'?'+new URLSearchParams({id,file:attachment})} className={link}>
    <Download size={16} aria-hidden="true" className="shrink-0" /><span className="[overflow-wrap:anywhere]">{filename} · dòng {row}</span>
  </a>
}

function SharedEvidence({ id, snapshot }: { id: string; snapshot: SharedPaymentSnapshot }) {
  return <section aria-label="Chứng từ được giao" className="space-y-3">
    {snapshot.invoice.lines[0]?.paymentDue && <p className="text-sm">Hạn thanh toán trên hóa đơn <time dateTime={snapshot.invoice.lines[0].paymentDue}>{snapshot.invoice.lines[0].paymentDue}</time></p>}
    <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {snapshot.lines?.map(line => <section key={line.code} aria-label={'Dòng '+line.code} className="space-y-3 py-3">
        <h2 className="text-sm font-semibold">Dòng {line.code}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums sm:grid-cols-4">
          <div><dt className="text-xs text-[var(--foreground-muted)]">PO đặt</dt><dd>{line.ordered} {line.unit}</dd></div>
          <div><dt className="text-xs text-[var(--foreground-muted)]">Kho thực nhận</dt><dd>{line.received} {line.unit}</dd></div>
          <div><dt className="text-xs text-[var(--foreground-muted)]">Đợt khác đã duyệt</dt><dd>{line.otherApproved} {line.unit}</dd></div>
          <div><dt className="text-xs text-[var(--foreground-muted)]">Hóa đơn tính</dt><dd>{line.quantity} {line.unit} · {formatVnd(line.invoicePrice)} / {line.unit}</dd></div>
        </dl>
        <details className="border border-[var(--border)] px-3">
          <summary className="neo-target cursor-pointer py-3 text-sm font-medium">Chứng từ dòng {line.code}</summary>
          <div className="space-y-2 pb-3">
            {snapshot.sources.filter(source=>source.operation==='create' || source.line===line.code).map((source,index)=>
              <div key={index} className="text-sm">
                <p className="break-words font-medium">{source.subject}</p>
                {source.quote && <p className="break-words">{source.quote}</p>}
                {source.attachment && <File id={id} attachment={source.attachment.id} filename={source.attachment.filename} row={source.attachment.row} />}
              </div>)}
            <div><p className="text-xs font-semibold">Bảng đơn giá</p>
              <File id={id} attachment={snapshot.price.evidence.attachmentId} filename={snapshot.price.evidence.filename} row={line.priceRow} /></div>
            <div><p className="text-xs font-semibold">Hóa đơn được giao</p>
              <File id={id} attachment={snapshot.invoice.evidence.attachmentId} filename={snapshot.invoice.evidence.filename} row={line.invoiceRow} /></div>
            {snapshot.allocations.filter(invoice=>invoice.id!==snapshot.invoice.id).flatMap(invoice=>
              invoice.lines.filter(record=>record.code===line.code).map(record=>
                <div key={invoice.id}><p className="text-xs font-semibold">{invoice.number} · {record.quantity} {record.unit} đã duyệt</p>
                  <File id={id} attachment={invoice.evidence.attachmentId} filename={invoice.evidence.filename} row={record.row} /></div>))}
          </div>
        </details>
      </section>)}
    </div>
    {snapshot.subtotal!==undefined && <p className="text-sm">Tổng trước thuế <strong>{formatVnd(snapshot.subtotal)}</strong></p>}
  </section>
}

export function PurchaseHandoffs({ id,userId,openSupplement }: { id?: string; userId: string; openSupplement: boolean }) {
  const cache = useQueryClient()
  const [reason,setReason] = useState('')
  const [returning,setReturning] = useState(false)
  const [requesting,setRequesting] = useState(openSupplement)
  const detail = useQuery({
    queryKey:['commitments',userId,'handoff',id],
    queryFn:({signal})=>handoffFetch<HandoffDetail>('?id='+encodeURIComponent(id!),{signal}),
    enabled:Boolean(id), retry:false, staleTime:0, refetchOnMount:true, refetchInterval:30_000,
  })
  const queue = useQuery({
    queryKey:['commitments',userId,'handoff-queue'],
    queryFn:({signal})=>handoffFetch<HandoffListItem[]>('',{signal}),
    enabled:!id,retry:false,refetchInterval:30_000,
  })
  const write = useHandoffWrite(() => {
    void detail.refetch()
    void cache.invalidateQueries({queryKey:['commitments',userId,'handoff-queue']})
    void cache.invalidateQueries({queryKey:['commitments',userId,'purchase-dues']})
    void cache.invalidateQueries({queryKey:['commitments',userId,'attention']})
  })
  const data = detail.data
  const current = id ? detail : queue
  const canRespond = id && data && (data.status==='pending' || data.status==='stale') && !write.receipt
  const item = data?.exception
  return <section aria-labelledby="handoff-heading" className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6">
    <div className="flex flex-wrap gap-x-4">
      <Link href={id ? handoffHref() : '/commitments'} prefetch={false} className={link}>
        <ArrowLeft size={16} aria-hidden="true" />{id ? 'Về hồ sơ được giao' : 'Về sổ cam kết'}
      </Link>
      <Link href="/commitments/dues" prefetch={false} className={link}>Công nợ cần xử lý</Link>
    </div>
    <h1 id="handoff-heading" className="border-s-2 border-[var(--accent)] ps-3 text-xl font-semibold sm:text-2xl">Hồ sơ Kế toán</h1>
    {current.isPending && <p role="status" className="text-sm">Đang tải hồ sơ…</p>}
    {current.isError && <Alert variant="warning">{current.error instanceof LedgerApiError && current.error.status===404
      ? 'Không tìm thấy hồ sơ được giao.' : 'Chưa tải được hồ sơ. Hãy thử lại.'}</Alert>}
    {!id && queue.data && (queue.data.length ? <ul aria-label="Hồ sơ được giao" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {queue.data.map(item=><li key={item.id} className="flex flex-wrap items-center gap-x-3">
        <Link href={handoffHref(item.id)} prefetch={false} className={link}>{item.invoice} · {item.reference}</Link>
        <Badge variant={item.status==='approved'?'success':'secondary'}>{statusLabel[item.status]}</Badge>
      </li>)}
    </ul> : <p className="text-sm">Chưa có hồ sơ được giao.</p>)}
    {id && data && <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-base font-semibold">{data.invoice} · {data.reference}</h2>
        <Badge variant={data.status==='approved'?'success':data.status==='stale'?'warning':'secondary'}>{statusLabel[data.status]}</Badge></div>
      {data.status==='stale' && <Alert variant="warning">Chứng từ hoặc số đã duyệt đã đổi. Mua hàng cần đối soát và bàn giao lại.</Alert>}
      {item?.stage==='reviewer' && data.snapshot && !write.receipt && <ExceptionComparison item={item} snapshot={data.snapshot} />}
      {item && <ExceptionHistory item={item} />}
      {item?.responseHandoff && item.responseHandoff!==id && item.stage!=='buyer' &&
        <Link href={handoffHref(item.responseHandoff)} prefetch={false} className={link}>Mở bản bổ sung</Link>}
      {id && data.canRequestEvidence && !write.receipt && !write.error?.uncertain && <section className="space-y-3 border-t border-[var(--border)] pt-3" aria-label="Yêu cầu bổ sung">
        {requesting ? <form className="space-y-3" onSubmit={event=>{
          event.preventDefault()
          void write.submit({action:'request_evidence',handoffId:id,reason})
        }}>
          <label className="block space-y-1"><span className="text-sm font-medium">Chứng từ cần bổ sung</span>
            <textarea required maxLength={500} value={reason} className={field} onChange={event=>setReason(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={write.busy} disabled={!reason.trim()}>Giao yêu cầu cho Mua hàng</Button>
            <Button type="button" variant="outline" disabled={write.busy} onClick={()=>setRequesting(false)}>Đóng yêu cầu</Button>
          </div>
        </form> : <Button type="button" variant="outline" onClick={()=>setRequesting(true)}>Yêu cầu bổ sung chứng từ</Button>}
      </section>}
      {data.snapshot && !write.receipt && <SharedEvidence id={id} snapshot={data.snapshot} />}
      {canRespond && !write.error?.uncertain && <div className="space-y-3 border-t border-[var(--border)] pt-3">
        <div className="flex flex-wrap gap-2">
          {data.snapshot && !returning && <Button type="button" loading={write.busy}
            onClick={()=>void write.submit({action:'approve',handoffId:id})}>
            {item?.stage==='reviewer' ? 'Duyệt bản bổ sung' : 'Duyệt đủ căn cứ thanh toán'}
          </Button>}
          <Button type="button" variant="outline" disabled={write.busy}
            onClick={()=>setReturning(!returning)}>{returning ? 'Đóng lý do' : 'Trả lại hồ sơ'}</Button>
        </div>
        {returning && <form className="space-y-2" onSubmit={event=>{ event.preventDefault(); void write.submit({action:'return',handoffId:id,reason}) }}>
          <label className="block space-y-1"><span className="text-xs font-medium">Lý do trả lại</span>
            <textarea required maxLength={500} value={reason} className={field} onChange={event=>setReason(event.target.value)} />
          </label>
          <Button type="submit" loading={write.busy} disabled={!reason.trim()}>Xác nhận trả lại</Button>
        </form>}
      </div>}
      {write.error && <Alert variant="warning"><p>{write.error.message}</p>
        {write.error.uncertain
          ? <Button type="button" variant="outline" className="mt-2" loading={write.busy} onClick={write.retry}>Thử lại cùng yêu cầu</Button>
          : <Button type="button" variant="outline" className="mt-2" onClick={()=>void detail.refetch()}>Tải lại hồ sơ</Button>}
      </Alert>}
      {write.receipt && <p role="status" className="text-sm">{reviewReceiptCopy[write.receipt.action]}</p>}
      {data.status === 'approved' && (!item || item.stage==='closed') && <PurchaseSettlementBalance userId={userId} scope={{ handoffId: id }} />}
      <History events={data.history} />
    </div>}
  </section>
}
