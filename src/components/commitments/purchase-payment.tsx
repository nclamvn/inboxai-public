'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LedgerApiError } from '@/lib/commitments/client'
import { formatVnd, paymentHref, paymentReceipt, type PaymentCommand, type PaymentPreview, type PaymentSnapshot, type PaymentSource } from '@/lib/commitments/purchase-payment'
import { HandoffOwnerPanel } from './purchase-handoff'
import { PurchaseCsvSource } from './purchase-csv-source'
import { PurchaseSettlementBalance } from './purchase-settlement'

const endpoint = '/api/commitments/payment'
const link = 'neo-target inline-flex min-h-11 min-w-0 items-center gap-2 break-words text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const statusCopy: Record<PaymentSnapshot['status'], string> = {
  unavailable: 'Chưa đủ chứng cứ để đối soát',
  missing_price: 'Chờ bảng đơn giá PO đã duyệt',
  missing_invoice: 'Chờ hóa đơn từ nhà cung cấp',
  blocked: 'Cần kiểm tra hóa đơn',
  ready: 'Đã khớp · Chờ duyệt',
  approved: 'Đủ căn cứ thanh toán',
  superseded: 'Đã được thay thế',
}

function SourceFile({ source, row }: { source: PaymentSource; row?: number }) {
  const query = new URLSearchParams({ email: source.emailId, file: source.attachmentId, digest: source.digest })
  return <div className="flex flex-wrap items-center gap-x-4">
    <Link href={'/inbox?email=' + source.emailId} prefetch={false} className={link}>
      <FileText size={16} aria-hidden="true" className="shrink-0" /><span className="[overflow-wrap:anywhere]">{source.subject}</span>
    </Link>
    <a href={'/api/commitments/purchase-csv?' + query} className={link}>
      <span className="[overflow-wrap:anywhere]">{source.filename}{row !== undefined && ' · dòng ' + row}</span>
    </a>
  </div>
}

export function PaymentComparison({ snapshot, detailsLink = false }: { snapshot: PaymentSnapshot; detailsLink?: boolean }) {
  return <section aria-label="Đối chiếu ba bên" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {snapshot.reference && <p className="text-sm font-semibold">{snapshot.reference}{snapshot.invoice && ' · ' + snapshot.invoice.number}</p>}
      <Badge variant={snapshot.status === 'approved' ? 'success' : snapshot.status === 'blocked' ? 'warning' : 'secondary'}>
        {statusCopy[snapshot.status]}
      </Badge>
    </div>
    {snapshot.balances && <section aria-label="Số lượng cộng dồn theo PO" className="space-y-2">
      <h2 className="text-sm font-semibold">Số lượng cộng dồn theo PO</h2>
      <table className="w-full table-fixed border-y border-[var(--border)] text-start text-sm tabular-nums">
        <thead className="bg-[var(--canvas)]"><tr>{['Dòng PO','Đã duyệt','Còn có thể duyệt','Đã duyệt vượt'].map(label =>
          <th key={label} scope="col" className="break-words px-2 py-2 text-start text-xs font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{snapshot.balances.map(line =>
          <tr key={line.code} className="break-words">
            <th scope="row" className="px-2 py-2 text-start">{line.code}</th>
            <td className="px-2 py-2">{line.approved} {line.unit}</td>
            <td className="px-2 py-2">{line.remaining} {line.unit}</td>
            <td className={line.over ? 'px-2 py-2 font-semibold text-[var(--warning)]' : 'px-2 py-2'}>
              {line.over ? line.over + ' ' + line.unit : '—'}
            </td>
          </tr>)}</tbody>
      </table>
    </section>}
    {snapshot.id && snapshot.invoices && snapshot.invoices.length > 1 && <details className="border-y border-[var(--border)]">
      <summary className="neo-target cursor-pointer py-3 text-sm font-semibold">Hóa đơn và bản thay thế trên PO</summary>
      <ul className="divide-y divide-[var(--border)]">
        {snapshot.invoices.map(invoice => <li key={invoice.id} className="flex flex-wrap items-center gap-x-3">
          <Link href={paymentHref(snapshot.id!,invoice.id)} prefetch={false} className={link}
            aria-current={invoice.id === snapshot.invoice?.id ? 'page' : undefined}>{invoice.number}</Link>
          <span className="text-xs text-[var(--foreground-muted)]">
            {invoice.superseded ? 'Đã được thay thế' : invoice.replaces ? 'Thay ' + invoice.replaces : 'Hóa đơn theo đợt'}
            {invoice.decisionAt && ' · Đã có lần duyệt'}
          </span>
        </li>)}
      </ul>
    </details>}
    {snapshot.invoice?.replaces && <p className="text-sm text-[var(--foreground-secondary)]">Hóa đơn thay thế {snapshot.invoice.replaces}</p>}
    {snapshot.invoice?.lines[0]?.paymentDue && <p className="text-sm">Hạn thanh toán trên hóa đơn <time dateTime={snapshot.invoice.lines[0].paymentDue}>{snapshot.invoice.lines[0].paymentDue}</time></p>}
    {snapshot.lines && <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {snapshot.lines.map(line => {
        const shortage = Math.max(0, line.quantity - line.received)
        const exceedsOrder = line.quantity > line.ordered
        const cumulativeOver = Math.max(0, line.quantity - line.available)
        const wrongPrice = line.invoicePrice !== line.expectedPrice
        return <section key={line.code} aria-label={'Dòng ' + line.code} className="space-y-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Dòng {line.code}</h2>
            {shortage > 0 && <Badge variant="warning">Thiếu {shortage} {line.unit} thực nhận</Badge>}
            {exceedsOrder && <Badge variant="warning">Vượt số đặt</Badge>}
            {cumulativeOver > 0 && line.otherApproved > 0 && <Badge variant="warning">Vượt cộng dồn {cumulativeOver} {line.unit}</Badge>}
            {wrongPrice && <Badge variant="warning">Sai đơn giá</Badge>}
            {!shortage && !exceedsOrder && !cumulativeOver && !wrongPrice && <Badge variant="success">Khớp chứng từ</Badge>}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
            <div><dt className="text-xs text-[var(--foreground-muted)]">PO đặt</dt><dd>{line.ordered} {line.unit}</dd><dd>{formatVnd(line.expectedPrice)} / {line.unit}</dd></div>
            <div><dt className="text-xs text-[var(--foreground-muted)]">Kho thực nhận</dt><dd>{line.received} {line.unit}</dd></div>
            <div><dt className="text-xs text-[var(--foreground-muted)]">Hóa đơn tính</dt><dd>{line.quantity} {line.unit}</dd><dd>{formatVnd(line.invoicePrice)} / {line.unit}</dd></div>
          </dl>
          {line.otherApproved > 0 && <p className="text-sm tabular-nums">Đợt khác đã duyệt {line.otherApproved} {line.unit}. Hóa đơn này có thể duyệt tối đa {line.available} {line.unit}.</p>}
          <details className="rounded-[var(--radius-control)] border border-[var(--border)] px-3">
            <summary className="neo-target cursor-pointer py-3 text-sm font-medium">Chứng từ dòng {line.code}</summary>
            <div className="space-y-2 pb-3">
              <div>
                <p className="text-xs font-semibold">Đơn giá trên PO</p>
                {snapshot.price && <SourceFile source={snapshot.price.evidence} row={line.priceRow} />}
                {snapshot.sources?.filter(source => source.operation === 'create' && source.href).map(source =>
                  <Link key={source.emailId} href={source.href!} prefetch={false} className={link}>Mở PO gốc · {source.subject}</Link>)}
              </div>
              <div>
                <p className="text-xs font-semibold">Phiếu nhập kho</p>
                {!snapshot.sources?.some(source => source.line === line.code) && <p className="mt-1 text-sm">Chưa có phiếu nhập đã duyệt cho dòng này.</p>}
                {snapshot.sources?.filter(source => source.line === line.code).map(source =>
                  <div key={source.attachment?.proofId ?? source.emailId + ':' + source.quote} className="flex flex-wrap gap-x-4">
                    {source.href && <Link href={source.href} prefetch={false} className={link}>{source.subject}</Link>}
                    {source.attachment && <PurchaseCsvSource source={source.attachment} />}
                  </div>)}
              </div>
              <div>
                <p className="text-xs font-semibold">Hóa đơn đã duyệt ở đợt khác</p>
                {snapshot.allocations?.filter(invoice => invoice.invoiceId !== snapshot.invoice?.id && invoice.installmentId !==
                  snapshot.invoices?.find(item => item.id === snapshot.invoice?.id)?.installmentId)
                  .flatMap(invoice => invoice.lines.filter(record => record.code === line.code).map(record =>
                    <div key={invoice.invoiceId} className="text-sm"><p>{invoice.number} · {record.quantity} {record.unit}</p>
                      <SourceFile source={invoice.evidence} row={record.row} /></div>))}
              </div>
              <div>
                <p className="text-xs font-semibold">Hóa đơn</p>
                {snapshot.invoice && <SourceFile source={snapshot.invoice.evidence} row={line.invoiceRow} />}
              </div>
            </div>
          </details>
        </section>
      })}
    </div>}
    {snapshot.subtotal !== undefined && <p className="text-sm tabular-nums">Tổng hóa đơn trước thuế <strong>{formatVnd(snapshot.subtotal)}</strong></p>}
    {snapshot.price && snapshot.status === 'missing_invoice' && <SourceFile source={snapshot.price.evidence} />}
    {snapshot.invoice && snapshot.status === 'missing_price' && <SourceFile source={snapshot.invoice.evidence} />}
    {detailsLink && snapshot.id && <Link href={paymentHref(snapshot.id,snapshot.invoice?.id)} prefetch={false} className={link}>Mở hồ sơ đối soát</Link>}
  </section>
}

type Scope = { id: string; invoiceId?: string } | {
  emailId: string; attachmentId: string; supplementId?: string; expectedDigest?: string
}

async function readJson(response: Response) {
  const body = await response.json()
  if (!response.ok) throw new LedgerApiError(response.status, body.error ?? 'Chưa đọc được bộ chứng từ.')
  return body
}

export function PurchasePayment({ userId, scope }: { userId: string; scope: Scope }) {
  const cache = useQueryClient()
  const params = new URLSearchParams('id' in scope ? { id: scope.id } : { email: scope.emailId, file: scope.attachmentId })
  const supplement = 'emailId' in scope && scope.supplementId && scope.expectedDigest
    ? { id: scope.supplementId, digest: scope.expectedDigest } : null
  if ('id' in scope && scope.invoiceId) params.set('invoice',scope.invoiceId)
  if (supplement) {
    params.set('supplement', supplement.id)
    params.set('digest', supplement.digest)
  }
  const data = useQuery({
    queryKey: ['commitments', userId, 'payment', scope],
    queryFn: async ({ signal }) => readJson(await fetch(endpoint + '?' + params, { signal, cache:'no-store' })),
    retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  const request = useRef<{ key: string; command: PaymentCommand } | null>(null)
  const busyRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ message: string; uncertain: boolean }>()
  const [managed, setManaged] = useState(false)
  const [saved, setSaved] = useState<PaymentReceipt>()
  const preview = 'emailId' in scope ? data.data as PaymentPreview | undefined : undefined
  const snapshot = 'id' in scope ? data.data as PaymentSnapshot | undefined : undefined

  async function save(command: PaymentCommand) {
    if (busyRef.current || saved || data.isFetching || (failure && !failure.uncertain)) return
    const frozen = request.current ?? { key: crypto.randomUUID(), command }
    request.current = frozen
    busyRef.current = true
    setPending(true)
    setFailure(undefined)
    try {
      const saveUrl = supplement ? endpoint + '?' + new URLSearchParams({ supplement: supplement.id }) : endpoint
      const received = paymentReceipt.parse(await readJson(await fetch(saveUrl, {
        method: 'POST', headers: { 'Content-Type':'application/json', 'Idempotency-Key':frozen.key },
        body: JSON.stringify(frozen.command),
      })))
      if (received.id !== frozen.command.id || Boolean(received.decisionId) !== (frozen.command.action === 'approve')) {
        throw new Error('Unexpected receipt')
      }
      setSaved(received)
      void cache.invalidateQueries({ queryKey: ['commitments',userId], refetchType: 'none' })
      if (received.decisionId) void data.refetch()
    } catch (error) {
      const known = error instanceof LedgerApiError && error.status < 500
      setFailure({ message: known ? error.message : 'Chưa nhận được biên nhận. Hãy thử lại cùng yêu cầu.', uncertain: !known })
    } finally {
      busyRef.current = false
      setPending(false)
    }
  }
  const retryPreview = () => {
    request.current = null
    setFailure(undefined)
    void data.refetch()
  }
  const handoffManaged = managed || snapshot?.handoffManaged
  const command = preview?.command ?? (handoffManaged ? null : snapshot?.command)
  return <section aria-labelledby="payment-heading" className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6">
    <Link prefetch={false} href={'emailId' in scope ? '/inbox?email=' + scope.emailId : '/commitments'}
      className={link}><ArrowLeft size={16} aria-hidden="true" />{'emailId' in scope ? 'Về email nguồn' : 'Về sổ cam kết'}</Link>
    <h1 id="payment-heading" className="border-s-2 border-[var(--accent)] ps-3 text-xl font-semibold sm:text-2xl">Đối soát trước thanh toán</h1>
    {supplement && <p className="text-sm text-[var(--foreground-secondary)]">Chứng từ bổ sung được mở từ hồ sơ đang chờ trong Inbox.</p>}
    {data.isPending && <p role="status" className="text-sm">Đang đọc chứng từ…</p>}
    {data.isError && <Alert variant="warning" title="Chứng từ cần kiểm tra">
      <p>{data.error instanceof LedgerApiError ? data.error.message : 'Chưa đọc được chứng từ. Hãy thử lại.'}</p>
      <div className="mt-2"><Button type="button" variant="outline" loading={data.isFetching} onClick={retryPreview}>Kiểm tra lại</Button></div>
    </Alert>}
    {preview && !data.isError && <section aria-label="Xem trước chứng từ" className="space-y-3">
      <p className="text-sm font-semibold">{preview.kind === 'price' ? 'Bảng đơn giá PO' : 'Hóa đơn'} {preview.number} · {preview.reference}</p>
      {preview.replaces && <p className="text-sm">Thay hóa đơn {preview.replaces}</p>}
      {preview.lines[0]?.paymentDue && <p className="text-sm">Hạn thanh toán trên hóa đơn <time dateTime={preview.lines[0].paymentDue}>{preview.lines[0].paymentDue}</time></p>}
      <p className="break-all text-xs text-[var(--foreground-muted)]">{preview.source.sender} → {preview.source.account}</p>
      <SourceFile source={preview.source} />
      <table className="w-full table-fixed border-y border-[var(--border)] text-sm">
        <thead className="bg-[var(--canvas)]"><tr>{['Dòng CSV','Mã dòng','Số lượng','Đơn giá'].map(label =>
          <th key={label} scope="col" className="break-words px-2 py-2 text-start text-xs font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{preview.lines.map(line =>
          <tr key={line.row} className="tabular-nums">
            <td className="px-2 py-2">{line.row}</td><th scope="row" className="break-words px-2 py-2 text-start">{line.code}</th>
            <td className="break-words px-2 py-2">{line.quantity} {line.unit}</td>
            <td className="break-words px-2 py-2">{formatVnd(line.price)}</td>
          </tr>)}</tbody>
      </table>
    </section>}
    {snapshot && !data.isError && <PaymentComparison snapshot={snapshot} />}
    {snapshot?.id && snapshot.invoice && handoffManaged && !data.isError &&
      <PurchaseSettlementBalance userId={userId} scope={{ orderId: snapshot.id, invoiceId: snapshot.invoice.id }} />}
    {snapshot?.id && snapshot.invoice && !data.isError && <HandoffOwnerPanel
      key={snapshot.invoice.id} userId={userId} commitmentId={snapshot.id} invoiceId={snapshot.invoice.id}
      proof={snapshot.command?.proof} setManaged={setManaged} />}
    {handoffManaged && snapshot?.command && <p className="text-sm text-[var(--foreground-secondary)]">
      Kế toán được giao sẽ duyệt hóa đơn này.
    </p>}
    {failure && <Alert variant="warning" title="Chưa xác nhận được">{failure.message}</Alert>}
    {saved && <div role="status" className="text-sm">
      {saved.decisionId ? 'Đã duyệt đối soát.' : 'Đã ghi nhận chứng từ.'}
      {saved.documentId && <div><Link href={paymentHref(saved.id, preview?.kind === 'invoice' ? saved.documentId : undefined)} prefetch={false} className={link}>Mở hồ sơ đối soát</Link></div>}
    </div>}
    {!saved && !data.isError && command && <div className="border-t border-[var(--border)] pt-3">
      {failure && !failure.uncertain
        ? <Button type="button" variant="outline" onClick={retryPreview}>Xem lại chứng từ</Button>
        : <Button type="button" loading={pending} disabled={data.isFetching} onClick={() => void save(command)}>
          {failure?.uncertain ? 'Thử lại cùng yêu cầu' : command.action === 'approve'
            ? 'Duyệt đủ căn cứ thanh toán' : preview?.kind === 'price' ? 'Duyệt đơn giá PO' : 'Ghi nhận hóa đơn'}
        </Button>}
    </div>}
  </section>
}

type PaymentReceipt = ReturnType<typeof paymentReceipt.parse>
