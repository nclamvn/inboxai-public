'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { LedgerApiError } from '@/lib/commitments/client'
import { commitmentReceipt } from '@/lib/commitments/contracts'
import type { PurchaseCsvApproval, PurchaseCsvPreview } from '@/lib/commitments/purchase-csv'
import { commitmentsHref } from '@/lib/commitments/view'
import { PurchaseLines } from './purchase-lines'
import { PurchaseCsvSource } from './purchase-csv-source'

const endpoint = '/api/commitments/purchase-csv'
const counts = new Intl.NumberFormat('vi-VN')

async function responseJson(response: Response) {
  const data = await response.json()
  if (!response.ok) throw new LedgerApiError(response.status, data.error ?? 'Chưa đối soát được phiếu CSV.')
  return data
}

export function PurchaseCsvReview({ emailId, attachmentId, userId }: { emailId: string; attachmentId: string; userId: string }) {
  const cache = useQueryClient()
  const preview = useQuery({
    queryKey: ['commitments', userId, 'purchase-csv', emailId, attachmentId],
    queryFn: async ({ signal }): Promise<PurchaseCsvPreview> => responseJson(await fetch(
      endpoint + '?' + new URLSearchParams({ email: emailId, file: attachmentId }), { signal, cache: 'no-store' })),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [failure, setFailure] = useState<{ message: string; uncertain: boolean }>()
  const [saved, setSaved] = useState<{ id: string; version: number }>()
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  const frozen = useRef<{ key: string; command: PurchaseCsvApproval } | null>(null)
  const result = preview.data

  async function approve() {
    if (!result || active.current || saved || (failure && !failure.uncertain) || preview.isFetching) return
    const approval = frozen.current ?? { key: crypto.randomUUID(), command: result.approval }
    frozen.current = approval
    active.current = true
    setBusy(true)
    setFailure(undefined)
    try {
      const receipt = commitmentReceipt.parse(await responseJson(await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': approval.key },
        body: JSON.stringify(approval.command),
      })))
      if (receipt.id !== approval.command.id || receipt.version !== approval.command.version + 1) throw new Error('Invalid receipt')
      setSaved(receipt)
      void cache.invalidateQueries({ queryKey: ['commitments', userId], refetchType: 'none' })
    } catch (error) {
      const known = error instanceof LedgerApiError && error.status < 500
      setFailure({
        message: known ? error.message : 'Chưa nhận được biên nhận. Thử lại cùng yêu cầu duyệt.',
        uncertain: !known,
      })
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  const reset = () => {
    frozen.current = null
    setFailure(undefined)
    void preview.refetch()
  }

  return <section aria-labelledby="purchase-csv-heading" className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6">
    <Link prefetch={false} href={'/inbox?email=' + encodeURIComponent(emailId)}
      className="neo-target inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)]">
      <ArrowLeft size={16} aria-hidden="true" /> Về email nguồn
    </Link>
    <header className="space-y-1 border-s-2 border-[var(--accent)] ps-3">
      <h1 id="purchase-csv-heading" className="text-xl font-semibold sm:text-2xl">Đối soát phiếu CSV</h1>
      {result && <p className="text-sm text-[var(--foreground-secondary)]">
        {result.reference} · {result.document}{result.original && ' · Đính chính ' + result.original}
      </p>}
    </header>
    {preview.isPending && <p role="status" className="text-sm">Đang đọc phiếu CSV…</p>}
    {preview.isError && <Alert variant="warning" title="Phiếu chờ xác minh">
      <p>{preview.error instanceof LedgerApiError ? preview.error.message : 'Chưa đọc được phiếu. Hãy thử lại.'}</p>
      <Button type="button" variant="outline" className="mt-2" loading={preview.isFetching} onClick={reset}>Kiểm tra lại tệp</Button>
    </Alert>}
    {result && !preview.isError && <div className="space-y-5">
      <div className="space-y-1 text-sm">
        <p className="flex items-start gap-2 font-semibold [overflow-wrap:anywhere]">
          <FileSpreadsheet className="mt-0.5 shrink-0" size={16} aria-hidden="true" />{result.filename}
        </p>
        <p className="break-words text-[var(--foreground-secondary)]">{result.subject}</p>
        <p className="break-all text-xs text-[var(--foreground-secondary)]">{result.sender} → {result.account}</p>
        <a href={endpoint + '?' + new URLSearchParams({ email: emailId, file: attachmentId, digest: result.approval.digest })}
          className="neo-target inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-foreground)] underline">
          Tải CSV nguồn
        </a>
      </div>
      <section aria-label="Dòng chứng từ" className="space-y-2">
        <h2 className="text-sm font-semibold">Dòng chứng từ</h2>
        <table className="w-full table-fixed border-y border-[var(--border)] text-start text-sm">
          <thead className="bg-[var(--canvas)] text-[var(--foreground-secondary)]">
            <tr>{['Dòng CSV', 'Mã dòng', 'Số trên phiếu', 'Thực nhận sau duyệt'].map(label =>
              <th key={label} scope="col" className="break-words px-2 py-2 text-start text-xs font-medium">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {result.rows.map(row => {
              const before = result.before.find(line => line.code === row.code)!
              const after = result.after.find(line => line.code === row.code)!
              return <tr key={row.row}>
                <td className="px-2 py-2 tabular-nums">{row.row}</td>
                <th scope="row" className="break-words px-2 py-2 text-start font-semibold">{row.code}</th>
                <td className="break-words px-2 py-2 tabular-nums">{counts.format(row.quantity)} {row.unit}</td>
                <td className="break-words px-2 py-2 tabular-nums">{counts.format(before.received)} → {counts.format(after.received)} {row.unit}</td>
              </tr>
            })}
          </tbody>
        </table>
      </section>
      {result.originals.length > 0 && <section aria-label="Chứng cứ trước đính chính" className="space-y-1">
        <h2 className="text-sm font-semibold">Chứng cứ trước đính chính</h2>
        {result.originals.map(source => source.attachment &&
          <p key={source.attachment.proofId}><PurchaseCsvSource source={source.attachment} /></p>)}
      </section>}
      <section aria-label="Đối soát sau khi duyệt" className="space-y-2">
        <h2 className="text-sm font-semibold">Đối soát sau khi duyệt</h2>
        <PurchaseLines lines={result.after} />
      </section>
      {failure && <Alert variant="warning" title="Chưa xác nhận được phiếu">{failure.message}</Alert>}
      {saved ? <div className="space-y-1 border-t border-[var(--border)] pt-3">
        <p role="status" className="text-sm font-semibold text-[var(--success)]">Đã ghi phiếu vào sổ · phiên bản {saved.version}.</p>
        <Link href={commitmentsHref('waiting', saved.id)} prefetch={false}
          className="neo-target inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-foreground)] underline">Mở sổ cam kết</Link>
      </div> : <div className="border-t border-[var(--border)] pb-4 pt-3">
        {failure && !failure.uncertain
          ? <Button type="button" variant="outline" onClick={reset}>Xem lại phiếu</Button>
          : <Button type="button" loading={busy} disabled={preview.isFetching} onClick={() => void approve()}>
            {failure?.uncertain ? 'Thử lại duyệt phiếu' : 'Duyệt và ghi phiếu'}
          </Button>}
      </div>}
    </div>}
  </section>
}
