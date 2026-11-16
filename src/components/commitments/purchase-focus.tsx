import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, FileUp, Clock3, ClipboardCheck, CircleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { PurchaseFocusItem } from '@/lib/commitments/purchase-focus'
import { handoffHref } from '@/lib/commitments/purchase-handoff'
import { paymentHref } from '@/lib/commitments/purchase-payment'
import { supplementScan, type SupplementScan } from '@/lib/commitments/purchase-supplement'
import { PurchaseSupplement } from './purchase-supplement'
import { PurchaseEvidenceRequest } from './purchase-evidence-request'

const link = 'neo-target inline-flex min-h-11 min-w-0 items-center gap-2 break-words text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const labels = {
  supply: 'Tôi phải bổ sung',
  resupply: 'Tôi phải bàn giao bản mới',
  waiting: 'Chờ Kế toán duyệt lại',
  review: 'Tôi phải duyệt lại',
  stale: 'Bản bàn giao đã thay đổi',
}
const actions = {
  supply: 'Mở hồ sơ cần bổ sung',
  resupply: 'Mở bản đính chính',
  waiting: 'Xem tiến độ hồ sơ',
  review: 'Xem và duyệt bản bổ sung',
  stale: 'Kiểm tra bản đã thay đổi',
}
const updates = {
  resupply: 'Đã có hóa đơn mới hơn bản đã bàn giao.',
  stale: 'Căn cứ của bản bàn giao đã thay đổi. Hãy kiểm tra hồ sơ trước khi duyệt.',
}
const visuals = {
  supply: { tone: 'important', Icon: FileUp }, resupply: { tone: 'important', Icon: FileUp },
  waiting: { tone: 'work', Icon: Clock3 }, review: { tone: 'important', Icon: ClipboardCheck },
  stale: { tone: 'urgent', Icon: CircleAlert },
}

function FocusRow({ item, userId, scan, scanUnavailable, refresh }: {
  item: PurchaseFocusItem; userId: string; scan?: SupplementScan; scanUnavailable: boolean; refresh: () => Promise<unknown>
}) {
  const detail = item.orderId && item.invoiceId
    ? paymentHref(item.orderId,item.invoiceId)
    : item.handoffId ? handoffHref(item.handoffId) : null
  const source = item.emailId ? '/inbox?email='+item.emailId : null
  const file = item.fileId && item.handoffId ? '/api/commitments/handoffs?' + new URLSearchParams({ id:item.handoffId,file:item.fileId }) : null
  const { tone, Icon } = visuals[item.task]

  return <li data-mail-tone={tone} className="neo-work-item grid min-w-0 gap-x-6 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="neo-signal-heading" aria-hidden="true"><Icon size={16} strokeWidth={1.8} /></span>
        <h4 className="text-sm font-semibold">{item.reference} · {item.invoice}</h4>
        <Badge variant={item.task==='waiting'?'info':item.task==='stale'?'error':'warning'}>{labels[item.task]}</Badge>
      </div>
      <p className="mt-2 break-words text-sm">{item.reason}</p>
      <p className="mt-1 break-all text-xs text-[var(--foreground-muted)]">
        Yêu cầu từ {item.requestedBy}{item.task==='waiting' && ' · Phụ trách duyệt '+item.reviewer}
      </p>
      {(item.task==='resupply' || item.task==='stale') && <p className="mt-2 text-sm">{updates[item.task]}</p>}
      {item.deadline && <p className="mt-2 text-sm">
        Hạn trên chứng từ <time dateTime={item.deadline}>{item.deadline.split('-').reverse().join('/')}</time>
      </p>}
      <div className="flex flex-wrap items-center gap-x-4">
        {source && <Link href={source} prefetch={false} className={link}>Email hóa đơn · {item.filename}</Link>}
        {file && <a href={file} className={link}>Tải chứng từ · {item.filename}</a>}
        {item.openCount>1 && <Link href="/commitments/dues" prefetch={false} className={link}>Xem {item.openCount-1} việc khác của PO</Link>}
      </div>
      {item.orderId && <PurchaseSupplement scan={scan} unavailable={scanUnavailable} refresh={refresh} />}
      {item.orderId && <PurchaseEvidenceRequest caseId={item.id} userId={userId} />}
    </div>
    {detail && <Link href={detail} prefetch={false} className={link}>
      {actions[item.task]}<ArrowRight size={16} className="shrink-0" aria-hidden="true" />
    </Link>}
  </li>
}

export function PurchaseFocus({ userId, items, unavailable }: {
  userId: string; items: PurchaseFocusItem[]; unavailable: boolean
}) {
  const cases = items.filter(item => item.orderId)
  const scan = useQuery({
    queryKey: ['commitments', userId, 'purchase-supplements', cases.map(item=>[item.id,item.invoiceId,item.task])],
    enabled: !unavailable && cases.length > 0,
    staleTime: 60_000, refetchInterval: 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams(cases.map(item=>['case',item.id]))
      const response = await fetch('/api/commitments/supplements?' + params, { signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Purchase supplement scan unavailable')
      return supplementScan.parse(await response.json())
    },
  })
  if (unavailable) return <p role="status" className="border-t border-[var(--border)] px-4 py-3 text-sm sm:px-5">
    Chưa cập nhật được hồ sơ mua hàng. <Link href="/commitments/dues" prefetch={false} className={link}>Mở bảng công nợ</Link>
  </p>
  if (!items.length) return null
  return <section aria-label="Hồ sơ mua hàng cần xử lý" className="border-t border-[var(--border)]">
    <div className="flex flex-wrap items-center justify-between gap-x-4 px-4 sm:px-5">
      <h3 className="py-2 text-sm font-semibold">Hồ sơ mua hàng cần xử lý</h3>
      <Link href="/commitments/dues" prefetch={false} className={link}>Xem bảng công nợ</Link>
    </div>
    <ul className="divide-y divide-[var(--border)]">{items.map(item => <FocusRow key={item.id} item={item} userId={userId} scan={scan.data?.find(candidate=>candidate.caseId===item.id)}
      scanUnavailable={scan.isError} refresh={scan.refetch} />)}</ul>
  </section>
}
