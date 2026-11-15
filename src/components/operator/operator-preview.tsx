'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { OperatorOutcomePanel } from './operator-outcome'
import { changeOperatorPlan, OperatorApiError } from '@/lib/operator/client'
import { operatorActions, operatorDate, type OperatorPlan, type OperatorReceipt, type OperatorStatus } from '@/lib/operator/contracts'

export const statusLabels: Record<OperatorStatus, string> = {
  planned: 'Chờ phê duyệt',
  approved: 'Đã phê duyệt',
  executed: 'Đã thực thi',
  stale: 'Phạm vi đã thay đổi',
  expired: 'Đã hết hạn',
}
const eventLabels: Record<OperatorStatus, string> = { ...statusLabels, planned: 'Đã lập kế hoạch' }
export function OperatorPreview({ plan, account, updated, refresh }: {
  plan: OperatorPlan
  account: string
  updated: (receipt: OperatorReceipt) => void
  refresh: () => Promise<unknown>
}) {
  const [selected, setSelected] = useState(() => new Set(plan.targets.filter(target => target.matchesPreview).map(target => target.id)))
  const [review, setReview] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; uncertain: boolean } | null>(null)
  const pending = useRef(false)
  const receipt = useRef<HTMLParagraphElement>(null)
  const editable = plan.status === 'planned'
  const ids = editable ? [...selected] : plan.approvedIds ?? []
  const activeIds = new Set(ids)
  const changed = editable && plan.targets.some(target => activeIds.has(target.id) && !target.matchesPreview)
  const action = operatorActions[plan.spec.action]
  const outcome = plan.spec.action === 'archive' ? 'Hộp thư đến → Lưu trữ' : 'Chưa đọc → Đã đọc'

  async function submit(operation: 'approve' | 'execute') {
    if (pending.current) return
    if (operation === 'approve' && !review) return
    if (operation === 'execute' && (plan.status !== 'approved' || !plan.approvedHash)) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await changeOperatorPlan(plan.id, operation === 'approve'
        ? { operation, previewHash: plan.previewHash, selectedIds: review! }
        : { operation, approvedHash: plan.approvedHash! })
      setReview(null)
      updated(result)
      requestAnimationFrame(() => receipt.current?.focus())
    } catch (failure) {
      const known = failure instanceof OperatorApiError && failure.status >= 400 && failure.status < 500
      setError({
        text: known ? failure.message : 'Chưa xác nhận được kết quả. Bạn có thể thử lại cùng phạm vi.',
        uncertain: !known,
      })
      if (known) {
        setReview(null)
        refresh()
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  function closeReview() {
    if (pending.current) return
    if (error?.uncertain) refresh()
    setReview(null)
    setError(null)
  }

  return (
    <section aria-label="Bản xem trước kế hoạch" className="min-w-0 border-y border-[var(--border)] bg-[var(--surface)]">
      <div className="space-y-3 px-4 py-5 sm:px-5">
        <div className="space-y-1 border-s-2 border-[var(--accent)] ps-3">
          <h2 className="text-base font-semibold">{action}</h2>
          <p ref={receipt} tabIndex={-1} role="status" className="text-sm font-medium">
            {plan.status === 'executed' ? 'Đã thực thi ' + plan.appliedCount + ' thư' : statusLabels[plan.status]}
          </p>
        </div>
        <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--foreground-muted)]">Tài khoản</dt><dd className="break-all">{account}</dd></div>
          <div><dt className="text-xs text-[var(--foreground-muted)]">Thay đổi trong InboxAI</dt><dd>{outcome}</dd></div>
          <div><dt className="text-xs text-[var(--foreground-muted)]">Điều kiện</dt>
            <dd className="break-all">{plan.spec.sender ? 'Từ ' + plan.spec.sender : 'Trước ' + operatorDate(plan.cutoff!)}</dd>
          </div>
          <div><dt className="text-xs text-[var(--foreground-muted)]">Hết hạn</dt><dd>{operatorDate(plan.expiresAt)}</dd></div>
        </dl>
        {plan.spec.keepAttachments && <p className="text-sm text-[var(--foreground-secondary)]">Giữ thư có tệp đính kèm.</p>}
        {plan.status === 'stale' && <Alert variant="warning" title="Cần lập kế hoạch mới">Một thư trong phạm vi đã thay đổi hoặc không còn khả dụng. Kế hoạch này chưa được thực thi.</Alert>}
        {plan.status === 'expired' && <Alert variant="warning" title="Kế hoạch đã hết hạn">Hãy lập kế hoạch mới để xem phạm vi hiện tại.</Alert>}
        {error && !review && <Alert variant="error" title="Chưa nhận được kết quả">{error.text}</Alert>}
      </div>

      <div className="border-y border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold">{plan.targets.length} thư trong bản xem trước</h3>
          {(editable || plan.approvedIds) && <p role="status" className="text-sm text-[var(--foreground-secondary)]">
            {editable ? 'Đã chọn ' : 'Đã duyệt '}{ids.length} thư
          </p>}
        </div>
        <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {plan.targets.map(target => (
            <li key={target.id} className="flex min-w-0 items-start gap-3 px-4 py-3 sm:px-5">
              {editable && <label className="neo-target flex min-h-11 min-w-7 items-center justify-center">
                <input type="checkbox" aria-label={'Chọn ' + (target.subject?.trim() || 'thư ' + target.id.slice(0, 8))}
                  className="size-4 accent-[var(--primary)]" checked={selected.has(target.id)}
                  disabled={busy || (!target.matchesPreview && !selected.has(target.id))}
                  onChange={event => {
                    const checked = event.target.checked
                    setSelected(current => {
                      const next = new Set(current)
                      if (checked) next.add(target.id)
                      else next.delete(target.id)
                      return next
                    })
                  }} />
              </label>}
              <div className="min-w-0 flex-1">
                {target.available
                  ? <Link href={'/inbox?email=' + target.id} prefetch={false}
                    className="neo-target inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4 [overflow-wrap:anywhere]">
                    {target.subject?.trim() || 'Email không có tiêu đề'}
                  </Link>
                  : <p className="pt-2 text-sm font-medium">Email không còn khả dụng</p>}
                {target.available && <p className="break-words text-xs text-[var(--foreground-muted)] [overflow-wrap:anywhere]">
                  {target.sender}{target.account ? ' · ' + target.account : ''}{target.at ? ' · ' + operatorDate(target.at) : ''}
                </p>}
                {target.hasAttachment && <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--foreground-secondary)]"><Paperclip size={14} aria-hidden="true" /> Có tệp đính kèm</p>}
                {editable && !target.matchesPreview && <p className="mt-1 text-xs text-[var(--error)]">Đã thay đổi từ lúc lập kế hoạch</p>}
                {plan.approvedIds && !activeIds.has(target.id) && <p className="mt-1 text-xs text-[var(--foreground-muted)]">Ngoài phạm vi đã duyệt</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 px-4 py-5 sm:px-5">
        {editable && <Button type="button" disabled={!ids.length || changed || busy} onClick={() => { setError(null); setReview(ids) }}>
          Xem lại phạm vi đã chọn
        </Button>}
        {plan.status === 'approved' && <Button type="button" loading={busy} onClick={() => void submit('execute')}>
          {error?.uncertain ? 'Thử thực thi lại' : 'Thực thi ' + ids.length + ' thư'}
        </Button>}
        {plan.outcome && <OperatorOutcomePanel plan={plan} outcome={plan.outcome} refresh={refresh} />}
        <h3 className="text-sm font-semibold">Nhật ký kế hoạch</h3>
        <ol className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
          {plan.events.map(entry => (
            <li key={entry.event} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
              <span>{eventLabels[entry.event]} · {entry.count} thư</span>
              <time dateTime={entry.at} className="text-xs tabular-nums text-[var(--foreground-muted)]">{operatorDate(entry.at)}</time>
            </li>
          ))}
        </ol>
      </div>

      <Modal open={review !== null} onClose={closeReview} title="Phê duyệt phạm vi" size="lg"
        description={action + ' ' + (review?.length ?? 0) + ' thư trong InboxAI.'}
        closeOnOverlayClick={false} closeOnEscape={!busy} showCloseButton={!busy}
        footer={<>
          <Button type="button" variant="ghost" disabled={busy} onClick={closeReview}>Quay lại bản xem trước</Button>
          <Button type="button" loading={busy} onClick={() => void submit('approve')}>
            {error?.uncertain ? 'Thử phê duyệt lại' : 'Phê duyệt phạm vi này'}
          </Button>
        </>}>
        <p className="text-sm text-[var(--foreground-secondary)]">Thao tác này khóa danh sách đã chọn. Việc cập nhật thư chỉ bắt đầu khi bạn bấm Thực thi.</p>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto border-y border-[var(--border)] py-2 text-sm">
          {plan.targets.filter(target => review?.includes(target.id)).map(target => (
            <li key={target.id} className="break-words [overflow-wrap:anywhere]">{target.subject?.trim() || 'Email không có tiêu đề'}</li>
          ))}
        </ul>
        {error && <div className="mt-3"><Alert variant="error" title="Chưa nhận được phê duyệt">{error.text}</Alert></div>}
      </Modal>
    </section>
  )
}
