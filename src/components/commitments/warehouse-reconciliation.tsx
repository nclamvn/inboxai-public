'use client'

import Link from 'next/link'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { confirmCommitmentReceiving, LedgerApiError } from '@/lib/commitments/client'
import { warehouseSender, type CommitmentState, type ReceivingCommand } from '@/lib/commitments/contracts'
import type { LedgerRevision } from '@/lib/commitments/view'
import { readWarehouseCorrection, readWarehouseReceipt, receivingTotals } from '@/lib/commitments/receiving'

export type WarehouseAccount = { id: string; email_address: string }
const control = 'min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)]'
const count = new Intl.NumberFormat('vi-VN')

export function WarehouseTotals({ state, hasReceipts = false }: { state: CommitmentState; hasReceipts?: boolean }) {
  const totals = receivingTotals(state)
  if (!totals) return null
  return <dl aria-label="Số lượng đối soát" className="grid grid-cols-3 gap-3 border-s-2 border-[var(--selection-line)] ps-3">
    {[
      { label: 'Nhà cung cấp báo giao', value: totals.reported },
      { label: 'Kho thực nhận', value: totals.received || (hasReceipts ? 0 : null) },
      { label: 'Còn thiếu theo đơn', value: totals.short },
    ].map(({ label, value }) => (
      <div key={label}>
        <dt className="text-xs text-[var(--foreground-secondary)]">{label}</dt>
        <dd className="mt-1 text-sm font-semibold tabular-nums">{value === null ? 'Chưa có phiếu' : count.format(value) + ' ' + totals.unit}</dd>
      </div>
    ))}
  </dl>
}

export function WarehouseReview({ id, version, state, mode, accounts, history, close, saved }: {
  id: string; version: number; state: CommitmentState; mode: 'configure' | 'close'; accounts: WarehouseAccount[]
  history: LedgerRevision[]
  close: () => void; saved: () => void
}) {
  const [accountId, setAccountId] = useState('')
  const [sender, setSender] = useState('')
  const [pending, setPending] = useState<{ key: string; command: ReceivingCommand } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ text: string; retry: boolean } | null>(null)
  const sending = useRef(false)
  const formId = useId()
  const supplier = history.find(item => item.changedFields.includes('delivery'))?.sources[0]
  const receipts = history.filter((item, index) => item.changedFields.includes('receiving') &&
      item.state.receiving && item.state.receiving.received !== (history[index + 1]?.state.receiving?.received ?? 0))
    .map(item => item.sources[0]).filter(Boolean)
  const evidenceReady = !!supplier && supplier.availability === 'available' &&
    receipts.length > 0 && receipts.every(source => source.availability === 'available' && source.quote && (readWarehouseReceipt(source.quote) || readWarehouseCorrection(source.quote)))
  const sources = supplier ? [supplier, ...receipts] : receipts

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current || failure?.retry === false) return
    const address = warehouseSender.safeParse(sender)
    if (!pending && mode === 'configure' && (!accountId || !address.success)) {
      setFailure({ text: 'Chọn hộp thư và nhập địa chỉ email kho hợp lệ.', retry: true })
      return
    }
    const command: ReceivingCommand = mode === 'close' ? { operation: 'close', expectedVersion: version } : {
      operation: 'configure', expectedVersion: version, accountId, sender: address.data ?? '',
    }
    const request = pending ?? { key: crypto.randomUUID(), command }
    setPending(request)
    setFailure(null)
    setBusy(true)
    sending.current = true
    try {
      const result = await confirmCommitmentReceiving(id, request.key, request.command)
      if (result.id !== id || result.version !== version + 1) throw new Error('Invalid receiving receipt')
      saved()
    } catch (error) {
      const known = error instanceof LedgerApiError && error.status < 500
      setFailure({ text: known ? error.message : 'Chưa nhận được biên nhận. Thử lại cùng yêu cầu.', retry: !known })
    } finally {
      setBusy(false)
      sending.current = false
    }
  }

  return <Modal open title={mode === 'configure' ? 'Thiết lập nguồn nhập kho' : 'Xác nhận khép đối soát'} size="lg"
    onClose={close} showCloseButton={!busy} closeOnEscape={!busy} closeOnOverlayClick={false}
    footer={<>
      <Button type="button" variant="outline" disabled={busy} onClick={close}>Đóng</Button>
      <Button type="submit" form={formId} loading={busy} disabled={failure?.retry === false || (mode === 'configure' && !accounts.length) || (mode === 'close' && !evidenceReady)}>
        {pending && failure?.retry ? 'Thử lưu lại' : mode === 'configure' ? 'Bật đối soát' : 'Xác nhận khép cam kết'}
      </Button>
    </>}>
    <form id={formId} className="space-y-4" onSubmit={event => void approve(event)}>
      {mode === 'configure' ? <>
        <p className="text-sm">Chọn hộp thư nhận phiếu nhập và địa chỉ kho được phép gửi phiếu cho đơn này.</p>
        <label className="block space-y-1 text-sm font-medium">
          <span>Hộp thư nhận phiếu nhập</span>
          <select className={control} value={accountId} onChange={event => setAccountId(event.target.value)} required disabled={!!pending}>
            <option value="">Chọn hộp thư</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.email_address}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Email nhân viên kho</span>
          <input className={control} type="email" value={sender} onChange={event => setSender(event.target.value)} maxLength={254} required disabled={!!pending} />
        </label>
        {state.status === 'completed' && <p className="text-sm">Cam kết sẽ mở lại để ghi nhận các phiếu nhập.</p>}
      </> : <>
        <WarehouseTotals state={state} />
        <ul aria-label="Email dùng để khép cam kết" className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
          {sources.map(source => <li key={source.emailId + source.quote} className="py-2">
            {source.availability === 'available' && source.href
              ? <Link href={source.href} target="_blank" rel="noopener" prefetch={false} className="neo-target inline-flex text-[var(--accent-foreground)] underline">{source.subject || 'Mở email nguồn'}</Link>
              : <p>Nguồn không còn khả dụng</p>}
            {source.quote && <blockquote className="break-words">{source.quote}</blockquote>}
          </li>)}
        </ul>
        <p className="text-sm">Xác nhận số báo giao và số thực nhận đã khớp số đặt. Sổ sẽ lưu chứng cứ và chuyển cam kết sang Đã khép.</p>
      </>}
      {failure && <Alert variant="error">{failure.text}</Alert>}
    </form>
  </Modal>
}
