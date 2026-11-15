'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LedgerApiError } from '@/lib/commitments/client'
import { batchDetail, batchHref, batchList, batchPreview, batchReceipt, type BatchCard, type BatchCommand, type BatchDetail } from '@/lib/commitments/purchase-batch'
import { handoffHref } from '@/lib/commitments/purchase-handoff'
import { formatVnd } from '@/lib/commitments/purchase-payment'

const endpoint = '/api/commitments/batches'
const link = 'neo-target inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const date = (day: string) => day.split('-').reverse().join('/')
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh' })
const stages = { pending:'Chờ duyệt', approved:'Đã duyệt · Chờ chứng từ', closed:'Đã đối chiếu đủ', cancelled:'Đã hủy' }
const actions = { submit:'Gửi duyệt', approve:'Duyệt đợt', cancel:'Hủy đợt', close:'Đối chiếu đủ chứng từ' }

async function request(suffix: string, init: RequestInit) {
  const response = await fetch(endpoint+suffix, { ...init,cache:'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new LedgerApiError(response.status,data?.error ?? 'Chưa đọc được đợt thanh toán.')
  return data
}

function BatchStatus({ batch }: { batch: BatchCard }) {
  return <Badge variant={batch.stale || batch.hasReturn ? 'warning' : batch.stage==='closed' ? 'success' : 'secondary'}>
    {batch.stale ? 'Cần lập lại đề nghị' : batch.hasReturn ? 'Có khoản bị hoàn · Cần đối soát' : stages[batch.stage]}
  </Badge>
}

function BatchProgress({ data }: { data: BatchDetail }) {
  const amount = data.lines.reduce((sum,line) => sum+line.amount,0)
  const paid = data.lines.reduce((sum,line) => sum+line.paid,0)
  return <>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--border)] py-3 text-sm sm:grid-cols-3">
      {([['Tổng đề nghị',amount],['Đã đối chiếu',paid],['Còn phải đối chiếu',amount-paid]] as const).map(([label,value]) => <div key={label}>
        <dt className="text-[var(--foreground-muted)]">{label}</dt><dd className="mt-1 break-words font-semibold tabular-nums">{formatVnd(value)}</dd>
      </div>)}
    </dl>
    <ul aria-label="Hóa đơn trong đợt" className="divide-y divide-[var(--border)] border border-[var(--border)] bg-[var(--surface)]">
      {data.lines.map(line => <li key={line.handoffId} className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="break-words text-sm font-semibold">{line.invoice} · {line.reference}</h2>
          <p className="text-sm tabular-nums"><strong>{formatVnd(line.paid)}</strong> / {formatVnd(line.amount)}</p>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">Hạn {date(line.deadline)}</p>
        <div className="flex flex-wrap gap-x-4">
          {data.role==='preparer' && <Link href={handoffHref(line.handoffId)} prefetch={false} className={link}>Mở hồ sơ hóa đơn</Link>}
          <a href={endpoint+'?'+new URLSearchParams({id:data.id,file:line.handoffId})} className={link}>Tải {line.filename}</a>
        </div>
        {line.entries.length>0 && <ul aria-label={'Chứng từ '+line.invoice} className="border-s-2 border-[var(--border)] ps-3">
          {line.entries.map(entry => <li key={entry.id} className="flex flex-wrap items-center gap-x-3 text-sm">
            {entry.emailId ? <Link href={'/inbox?email='+entry.emailId} prefetch={false} className={link}>{entry.reference}</Link>
              : <span className="break-all py-2 font-medium">{entry.reference}</span>}
            <span>{entry.kind==='return'?'Hoàn tiền · ':''}{date(entry.date)} · {formatVnd(entry.amount)}</span>
          </li>)}
        </ul>}
      </li>)}
    </ul>
  </>
}

export function PurchaseBatches({ userId,id,selected }: { userId: string; id?: string; selected?: string[] }) {
  const router = useRouter()
  const cache = useQueryClient()
  const [approver,setApprover] = useState('')
  const [cancelling,setCancelling] = useState(false)
  const [busy,setBusy] = useState(false)
  const [receipt,setReceipt] = useState<{ action: BatchCommand['action'] }>()
  const [error,setError] = useState<{ message: string; uncertain: boolean }>()
  const frozen = useRef<{ key: string; command: BatchCommand } | null>(null)
  const inFlight = useRef(false)
  const queryKey = ['commitments',userId,'purchase-batches']
  const preview = useQuery({
    queryKey:[...queryKey,'preview',selected], enabled:Boolean(selected),
    queryFn:async ({ signal }) => {
      const params = new URLSearchParams((selected ?? []).map(target=>['selected',target]))
      return batchPreview.parse(await request('?'+params,{signal}))
    },
    retry:false, refetchOnWindowFocus:false, refetchOnReconnect:false,
  })
  const detail = useQuery({
    queryKey:[...queryKey,'detail',id], enabled:Boolean(id), staleTime:0, refetchOnMount:true,
    queryFn:async ({ signal })=>batchDetail.parse(await request('?id='+encodeURIComponent(id!),{signal})),
    retry:false, refetchInterval:30_000,
  })
  const list = useQuery({
    queryKey:[...queryKey,'list'], enabled:!id&&!selected, staleTime:0, refetchOnMount:true,
    queryFn:async ({ signal })=>batchList.parse(await request('',{signal})),retry:false,refetchInterval:30_000,
  })
  const current = id ? detail : selected ? preview : list
  const data = detail.data

  async function submit(command: BatchCommand) {
    if (inFlight.current) return
    inFlight.current = true
    const attempt = frozen.current ?? { key:crypto.randomUUID(),command }
    frozen.current = attempt
    setBusy(true)
    setError(undefined)
    try {
      const result = batchReceipt.parse(await request('',{
        method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},
        body:JSON.stringify(attempt.command),signal:AbortSignal.timeout(65_000),
      }))
      if (result.action!==attempt.command.action || (attempt.command.action!=='submit' && result.id!==attempt.command.id)) {
        throw new Error('Unexpected batch receipt')
      }
      frozen.current = null
      setReceipt(result)
      setCancelling(false)
      void cache.invalidateQueries({queryKey})
      void cache.invalidateQueries({queryKey:['commitments',userId,'purchase-dues']})
      if (result.action==='submit') router.replace(batchHref(result.id))
    } catch (failure) {
      const known = failure instanceof LedgerApiError && failure.status<500
      if (known) {
        frozen.current = null
        if (id) void detail.refetch()
      }
      setError({ message:known?failure.message:'Chưa nhận được biên nhận. Hãy thử lại cùng yêu cầu.',uncertain:!known })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return <section aria-labelledby="batch-heading" className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6">
    <nav aria-label="Điều hướng công nợ" className="flex flex-wrap gap-x-4">
      <Link href="/commitments/dues" prefetch={false} className={link}><ArrowLeft size={16} aria-hidden="true" />Về bảng công nợ</Link>
      {(id || selected) && <Link href="/commitments/batches" prefetch={false} className={link}>Danh sách các đợt</Link>}
    </nav>
    <h1 id="batch-heading" className="border-s-2 border-[var(--accent)] ps-3 text-xl font-semibold sm:text-2xl">
      {selected?'Xem trước đợt thanh toán':'Đợt thanh toán'}
    </h1>
    {current.isPending && <p role="status" className="text-sm">Đang đọc hồ sơ…</p>}
    {current.isError && <Alert variant="warning">{current.error instanceof LedgerApiError?current.error.message:'Chưa đọc được đợt. Hãy tải lại trang.'}</Alert>}
    {list.data && !list.isError && (list.data.length
      ? <ul aria-label="Danh sách đợt thanh toán" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {list.data.map(batch => <li key={batch.id} className="flex flex-wrap items-center gap-x-3">
          <Link className={link} href={batchHref(batch.id)} prefetch={false}>{dateTime.format(new Date(batch.at))} · {batch.preparer}</Link>
          <BatchStatus batch={batch} />
        </li>)}
      </ul> : <p className="text-sm">Chưa có đợt thanh toán thuộc phạm vi của bạn.</p>)}
    {preview.data && !preview.isError && <form className="space-y-4" onSubmit={event=>{
      event.preventDefault()
      if (preview.data && approver) void submit({ action:'submit',approverId:approver,
        lines:preview.data.lines.map(({handoffId,proof})=>({handoffId,proof})) })
    }}>
      <ul aria-label="Phạm vi đề nghị" className="divide-y divide-[var(--border)] border border-[var(--border)] bg-[var(--surface)]">
        {preview.data.lines.map(line => <li key={line.handoffId} className="space-y-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2 font-semibold">
            <span>{line.invoice} · {line.reference}</span><span className="tabular-nums">{formatVnd(line.amount)}</span>
          </div>
          <p className="text-[var(--foreground-muted)]">Hạn {date(line.deadline)}</p>
          <Link href={handoffHref(line.handoffId)} prefetch={false} className={link}>Hồ sơ · {line.filename}</Link>
        </li>)}
      </ul>
      <p className="text-sm">Tổng đề nghị trước thuế <strong>{formatVnd(preview.data.lines.reduce((sum,line)=>sum+line.amount,0))}</strong></p>
      {preview.data.approvers.length>0 ? <label className="block space-y-1 text-sm">
        <span>Người duyệt đợt</span>
        <select required value={approver} onChange={event=>setApprover(event.target.value)} disabled={busy || error?.uncertain}
          className="block min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] p-2">
          <option value="">Chọn người có quyền duyệt</option>
          {preview.data.approvers.map(person=><option value={person.id} key={person.id}>{person.label}</option>)}
        </select>
      </label> : <Alert variant="warning">Tài khoản chưa có người được cấp quyền duyệt đợt.</Alert>}
      <Button type="submit" disabled={!approver || error?.uncertain || Boolean(receipt)} loading={busy}>Gửi đề nghị duyệt</Button>
    </form>}
    {data && !detail.isError && <>
      <div className="flex flex-wrap items-center gap-3"><BatchStatus batch={data} />
        <p className="break-all text-sm">{data.preparer} → {data.approver}</p>
      </div>
      {data.stale && <Alert variant="warning">Chứng từ, số dư hoặc quyền duyệt đã đổi. Kế toán cần hủy đợt và lập lại.</Alert>}
      {data.hasReturn && <Alert variant="warning">Có chứng từ hoàn đã ghi vào sổ. Phần còn lại cần được đối soát trước khi ghi thêm khoản trả.</Alert>}
      <BatchProgress data={data} />
      {!error?.uncertain && !receipt && data.role==='approver' && data.stage==='pending' && !data.stale &&
        <Button type="button" loading={busy} onClick={()=>void submit({action:'approve',id:data.id})}>Duyệt đợt thanh toán</Button>}
      {!error?.uncertain && data.role==='preparer' && ['approved','pending'].includes(data.stage) && <div className="flex flex-wrap items-center gap-3">
        {cancelling ? <>
          <p className="text-sm">Hủy sẽ giải phóng các khoản đang giữ. Chứng từ đã ghi vẫn ở trong sổ.</p>
          <Button type="button" loading={busy} variant="outline" onClick={()=>void submit({action:'cancel',id:data.id})}>Xác nhận hủy đợt</Button>
          <Button type="button" variant="outline" onClick={()=>setCancelling(false)}>Quay lại</Button>
        </> : <Button type="button" variant="outline" onClick={()=>setCancelling(true)}>Hủy đợt</Button>}
      </div>}
      {data.events.length>0 && <ol aria-label="Lịch sử đợt" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {data.events.map(event=><li key={event.id} className="space-y-1 py-3 text-sm">
          <p className="font-medium">{actions[event.action]}</p>
          <p className="break-all text-xs text-[var(--foreground-muted)]">{event.actor} · <time dateTime={event.at}>{dateTime.format(new Date(event.at))}</time></p>
        </li>)}
      </ol>}
    </>}
    {error && <Alert variant="warning"><p>{error.message}</p>
      {error.uncertain && <Button type="button" variant="outline" loading={busy} className="mt-2"
        onClick={()=>{ if (frozen.current) void submit(frozen.current.command) }}>Thử lại cùng yêu cầu</Button>}
    </Alert>}
    {receipt && <p role="status" className="text-sm">{receipt.action==='approve'?'Đã duyệt đợt thanh toán.':receipt.action==='cancel'?'Đã hủy đợt.':'Đã gửi đề nghị.'}</p>}
  </section>
}
