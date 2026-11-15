'use client'

import { useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { changeOperatorOutcome, OperatorApiError } from '@/lib/operator/client'
import { operatorDate, type OperatorOutcome, type OperatorOutcomeReceipt, type OperatorPlan } from '@/lib/operator/contracts'

function describeEvent(event: OperatorOutcomeReceipt) {
  if (event.event === 'undone') return 'Đã hoàn tác ' + event.matched + ' thư và kiểm tra lại trạng thái gốc'
  const summary = event.matched + ' khớp · ' + event.changed + ' đã thay đổi · ' + event.unavailable + ' không khả dụng'
  return (event.event === 'verified' ? 'Đã xác minh' : 'Đã chặn hoàn tác') + ' · ' + summary
}

export function OperatorOutcomePanel({ plan, outcome, refresh }: {
  plan: OperatorPlan
  outcome: OperatorOutcome
  refresh: () => Promise<unknown>
}) {
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState<'verify' | 'undo' | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [response, setResponse] = useState<OperatorOutcomeReceipt | null>(null)
  const pending = useRef(false)
  const requestKeys = useRef<Partial<Record<'verify' | 'undo', string>>>({})
  const status = useRef<HTMLParagraphElement>(null)
  const verification = outcome.events.find(event => event.event === 'verified')
  const undoReceipt = outcome.events.find(event => event.event === 'undone')
  const undone = outcome.undone || response?.event === 'undone'
  const conflicts = outcome.targets.filter(target => target.state !== 'matched')
  const canUndo = Boolean(outcome.undoHash && !undone && !conflicts.length)
  const subjectById = new Map(plan.targets.map(target => [target.id, target.subject?.trim() || 'Email không còn tiêu đề']))

  async function submit(operation: 'verify' | 'undo') {
    if (pending.current || (operation === 'undo' && (!review || !outcome.undoHash))) return
    pending.current = true
    setBusy(operation)
    setFailure(null)
    const key = requestKeys.current[operation] ??= crypto.randomUUID()
    try {
      const receipt = await changeOperatorOutcome(plan.id, operation === 'verify'
        ? { operation } : { operation, undoHash: outcome.undoHash! }, key)
      delete requestKeys.current[operation]
      setResponse(receipt)
      setReview(false)
      await refresh()
      requestAnimationFrame(() => status.current?.focus())
    } catch (error) {
      if (error instanceof OperatorApiError && error.status >= 400 && error.status < 500) {
        delete requestKeys.current[operation]
        setReview(false)
        void refresh()
      }
      setFailure(error instanceof OperatorApiError ? error.message : 'Chưa nhận được kết quả. Hãy thử lại cùng phạm vi.')
    } finally {
      pending.current = false
      setBusy(null)
    }
  }

  function closeReview() {
    if (pending.current) return
    if (requestKeys.current.undo) void refresh()
    setReview(false)
  }

  return (
    <section aria-label="Xác minh và hoàn tác" className="space-y-3 border-t border-[var(--border)] pt-4">
      <h3 className="text-sm font-semibold">Xác minh và hoàn tác</h3>
      <p ref={status} tabIndex={-1} role="status" className="border-s-2 border-[var(--accent)] ps-3 text-sm font-medium">
        {undone ? undoReceipt ? describeEvent(undoReceipt) : 'Đã hoàn tác kế hoạch'
          : response ? describeEvent(response)
          : verification ? describeEvent(verification) : 'Chưa có lần xác minh được ghi nhận'}
      </p>
      {!outcome.tracked && <p className="text-sm text-[var(--foreground-secondary)]">
        Kế hoạch cũ chỉ có thể kiểm tra cờ hiện tại. Trạng thái gốc để hoàn tác chưa được lưu.
      </p>}
      {!undone && conflicts.length > 0 && <Alert variant="warning" title="Kết quả hiện tại không còn khớp">
        <p>Hoàn tác bị chặn cho cả phạm vi.</p>
        <ul className="mt-2 space-y-1">
          {conflicts.map(target => <li key={target.id} className="break-words">
            {subjectById.get(target.id)} · {target.state === 'unavailable' ? 'Không khả dụng' : 'Đã thay đổi'}
          </li>)}
        </ul>
      </Alert>}
      {failure && !review && <Alert variant="error" title="Chưa xử lý được yêu cầu">{failure}</Alert>}
      {!undone && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" loading={busy === 'verify'} disabled={busy === 'undo'} onClick={() => void submit('verify')}>
          Xác minh lại
        </Button>
        {outcome.undoHash && <Button type="button" variant="outline" disabled={!canUndo || busy !== null}
          onClick={() => { setFailure(null); setReview(true) }}>Xem trước hoàn tác</Button>}
      </div>}
      {outcome.events.length > 0 && <ol className="divide-y divide-[var(--border)] border-y border-[var(--border)]" aria-label="Nhật ký xác minh và hoàn tác">
        {outcome.events.map(event => <li key={event.id} className="flex flex-wrap justify-between gap-x-3 py-2 text-sm">
          <span>{describeEvent(event)}</span>
          <time dateTime={event.at} className="text-xs tabular-nums text-[var(--foreground-muted)]">{operatorDate(event.at)}</time>
        </li>)}
      </ol>}
      <Modal open={review && !undone} onClose={closeReview} title="Xác nhận hoàn tác" size="lg"
        description={'Khôi phục trạng thái gốc của ' + outcome.targets.length + ' thư trong kế hoạch.'}
        closeOnOverlayClick={false} closeOnEscape={!busy} showCloseButton={!busy}
        footer={<>
          <Button type="button" variant="ghost" onClick={closeReview} disabled={busy !== null}>Quay lại</Button>
          <Button type="button" loading={busy === 'undo'} onClick={() => void submit('undo')}>{failure ? 'Thử hoàn tác lại' : 'Hoàn tác phạm vi này'}</Button>
        </>}>
        <ul className="max-h-60 divide-y divide-[var(--border)] overflow-y-auto text-sm">
          {outcome.targets.map(target => <li key={target.id} className="space-y-1 py-2">
            <p className="break-words font-medium [overflow-wrap:anywhere]">{subjectById.get(target.id)}</p>
            <p className="text-[var(--foreground-secondary)]">{plan.spec.action === 'archive'
              ? 'Lưu trữ → Hộp thư đến' : 'Đã đọc → Chưa đọc'}{target.before === null ? ' (trạng thái gốc chưa đặt)' : ''}</p>
          </li>)}
        </ul>
        {failure && <Alert variant="error" title="Chưa nhận được kết quả">{failure}</Alert>}
      </Modal>
    </section>
  )
}
