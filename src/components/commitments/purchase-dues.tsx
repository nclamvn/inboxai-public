'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { deadlineStatus, purchaseDuesPage, type PurchaseDue } from '@/lib/commitments/purchase-dues'
import { dueExceptionLabel, handoffHref } from '@/lib/commitments/purchase-handoff'
import { formatVnd } from '@/lib/commitments/purchase-payment'

const link = 'neo-target inline-flex min-h-11 items-center gap-2 break-words text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const labels = {
  waiting: 'Chờ thanh toán',
  partial: 'Đã trả một phần',
  reopened: 'Công nợ mở lại',
  review: 'Cần đối soát lại',
}

function DueRow({ item, now, selected, toggle, selectionFull }: {
  item: PurchaseDue; now: Date; selected: boolean; toggle: () => void; selectionFull: boolean
}) {
  const timing = item.deadline && deadlineStatus(item.deadline, now)
  const detail = item.role === 'owner' && item.orderId && item.invoiceId
    ? '/commitments/payment?' + new URLSearchParams({ id: item.orderId, invoice: item.invoiceId })
    : handoffHref(item.exception?.reviewHandoff ?? item.id)
  const evidence = item.invoiceAttachmentId && '/api/commitments/handoffs?' + new URLSearchParams({
    id: item.id, file: item.invoiceAttachmentId, evidence: 'payment-due',
  })
  const eligible = item.deadline && item.status!=='review' && !item.exception && item.remaining>0
  return <li className="grid min-w-0 gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)]">
    <div className="min-w-0">
      <h2 className="break-words text-base font-semibold">{item.invoice} · {item.reference}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant={item.status === 'review' || item.status === 'reopened' ? 'warning' : 'secondary'}>
          {item.exception ? dueExceptionLabel[item.exception.stage] : labels[item.status]}
        </Badge>
        {timing && <Badge variant={timing === 'Quá hạn' ? 'error' : timing === 'Đến hạn hôm nay' ? 'warning' : 'secondary'}>{timing}</Badge>}
      </div>
    </div>
    <dl className="min-w-0 sm:text-end">
      <dt className="text-xs text-[var(--foreground-muted)]">{item.status === 'review' ? 'Số dư theo bản đã duyệt' : 'Còn phải trả trước thuế'}</dt>
      <dd className="break-words text-lg font-semibold tabular-nums">{formatVnd(item.remaining)}</dd>
      <dt className="sr-only">Hạn thanh toán</dt>
      <dd className="mt-1 text-sm text-[var(--foreground-secondary)]">{item.deadline
        ? <time dateTime={item.deadline}>Hạn {item.deadline.split('-').reverse().join('/')}</time>
        : 'Chưa xác minh hạn'}</dd>
    </dl>
    <div className="flex flex-wrap gap-x-4 sm:col-span-2">
      {item.role==='reviewer' && <label className="neo-target inline-flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" aria-label={'Chọn '+item.invoice+' vào đợt'}
          disabled={!eligible || (selectionFull && !selected)} checked={selected && Boolean(eligible)}
          onChange={toggle} className="size-4 accent-[var(--accent)]" />
        <span className={!eligible?'text-[var(--foreground-muted)]':undefined}>Chọn vào đợt</span>
      </label>}
      <Link href={detail} prefetch={false} className={link}>Mở hồ sơ</Link>
      {item.canRequestEvidence && <Link href={detail + '&supplement=1'} prefetch={false} className={link}>Yêu cầu bổ sung chứng từ</Link>}
      {item.invoiceEmailId && <Link href={'/inbox?email=' + item.invoiceEmailId} prefetch={false} className={link}>Email hóa đơn</Link>}
      {evidence && <a href={evidence} className={link}>Tải hóa đơn đã duyệt</a>}
      {item.returnEmailId && <Link href={'/inbox?email=' + item.returnEmailId} prefetch={false} className={link}>Email chứng từ hoàn</Link>}
    </div>
  </li>
}

export function PurchaseDues({ userId }: { userId: string }) {
  const [page, setPage] = useState(0)
  const [chosen, setChosen] = useState<string[]>([])
  const [now, setNow] = useState(() => new Date())
  const query = useQuery({
    queryKey: ['commitments', userId, 'purchase-dues', page],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/commitments/dues?page=' + page, { signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Purchase dues request failed')
      return purchaseDuesPage.parse(await response.json())
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 30_000,
  })
  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = window.setInterval(update, 30_000)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [])
  const selected = query.data?.items.filter(item => chosen.includes(item.id) && item.role==='reviewer'
    && item.deadline && item.remaining>0 && item.status!=='review' && !item.exception).map(item=>item.id) ?? []
  const selection = new URLSearchParams(selected.map(id=>['selected',id]))
  function changePage(next: number) {
    setChosen([])
    setPage(next)
  }

  return <section aria-labelledby="dues-heading" className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
    <nav aria-label="Điều hướng công nợ" className="flex flex-wrap gap-x-4">
      <Link href="/commitments" prefetch={false} className={link}><ArrowLeft size={16} aria-hidden="true" />Về sổ cam kết</Link>
      <Link href="/commitments/batches" prefetch={false} className={link}>Đợt thanh toán</Link>
    </nav>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 id="dues-heading" className="border-s-2 border-[var(--accent)] ps-3 text-xl font-semibold sm:text-2xl">Công nợ cần xử lý</h1>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">Hạn thanh toán theo ngày Việt Nam</p>
      </div>
      <Button type="button" variant="outline" loading={query.isFetching} onClick={() => {
        setNow(new Date())
        void query.refetch()
      }}>Làm mới công nợ</Button>
    </div>
    {query.isPending && <p role="status" className="text-sm">Đang tải công nợ…</p>}
    {query.isError && <Alert variant="warning">Chưa xác nhận được số dư. Hãy tải lại công nợ.</Alert>}
    {query.isSuccess && selected.length>0 && <div className="flex flex-wrap items-center gap-x-4 border-y border-[var(--border)]">
      <p role="status" className="text-sm">Đã chọn {selected.length} hóa đơn</p>
      <Link href={'/commitments/batches?'+selection} prefetch={false} className={link}>Lập đợt thanh toán</Link>
    </div>}
    {query.isSuccess && (query.data.items.length
      ? <ul aria-label="Các khoản cần xử lý" className="divide-y divide-[var(--border)] border border-[var(--border)] bg-[var(--surface)]">
        {query.data.items.map(item => <DueRow key={item.id} item={item} now={now} selected={selected.includes(item.id)}
          selectionFull={selected.length>=8} toggle={()=>setChosen(ids=>ids.includes(item.id)
            ? ids.filter(id=>id!==item.id) : [...ids,item.id])} />)}
      </ul>
      : <p role="status" className="text-sm">{page ? 'Trang này đã hết mục. Hãy quay lại trang trước.' : 'Không có công nợ cần xử lý trong phạm vi của bạn.'}</p>)}
    {(page > 0 || query.data?.hasMore) && <nav aria-label="Trang công nợ" className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={!page || query.isFetching} onClick={() => changePage(page - 1)}>Trang trước</Button>
      <span aria-live="polite" className="text-sm">Trang {page + 1}</span>
      <Button type="button" variant="outline" disabled={!query.data?.hasMore || query.isFetching} onClick={() => changePage(page + 1)}>Trang sau</Button>
    </nav>}
  </section>
}
