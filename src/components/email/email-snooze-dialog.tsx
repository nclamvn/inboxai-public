'use client'

import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { changeEmailSnooze, emailSnoozeChanged, EmailSnoozeError, type SnoozeTarget } from '@/lib/snooze/client'

function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function startingValue(target: SnoozeTarget) {
  if (target.snoozed_until && Date.parse(target.snoozed_until) > Date.now()) return localInput(new Date(target.snoozed_until))
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return localInput(next)
}

export function EmailSnoozeDialog({ email, mode, onClose, onSaved }: {
  email: SnoozeTarget
  mode: 'schedule' | 'move' | 'cancel'
  onClose: () => void
  onSaved?: (until: string | null) => void
}) {
  const [value, setValue] = useState(() => startingValue(email))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const receipt = useRef<{ until: string | null; id: string } | null>(null)
  const formId = useId()
  const cancel = mode === 'cancel'
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  async function save() {
    if (pending.current) return
    const local = new Date(value)
    if (!cancel && (Number.isNaN(local.getTime()) || localInput(local) !== value)) {
      setError('Giờ này không hợp lệ trong múi giờ đang dùng. Hãy chọn giờ khác.')
      return
    }
    const until = cancel ? null : local.toISOString()
    if (!receipt.current || receipt.current.until !== until) receipt.current = { until, id: crypto.randomUUID() }

    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await changeEmailSnooze(email, until, receipt.current.id)
      window.dispatchEvent(new Event(emailSnoozeChanged))
      onSaved?.(until)
      onClose()
    } catch (reason) {
      setError(reason instanceof EmailSnoozeError ? reason.message : 'Mất kết nối. Hãy thử lưu lại.')
      if (reason instanceof EmailSnoozeError && ['PT409', 'PT404'].includes(reason.code)) {
        window.dispatchEvent(new Event(emailSnoozeChanged))
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <Modal open title={cancel ? 'Hủy hẹn xử lý' : mode === 'move' ? 'Dời hẹn xử lý' : 'Hẹn xử lý thư'}
    description={email.subject ?? '(Không có tiêu đề)'} onClose={() => { if (!pending.current) onClose() }}
    closeOnEscape={!busy} closeOnOverlayClick={!busy} showCloseButton={!busy}
    footer={<>
      <Button variant="outline" type="button" disabled={busy} onClick={onClose}>Đóng</Button>
      <Button type="submit" form={formId} loading={busy}>{cancel ? 'Xác nhận hủy hẹn' : 'Lưu lịch'}</Button>
    </>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      {cancel ? <p className="text-sm">Thư sẽ trở lại Inbox nếu vẫn thuộc hộp thư đến.</p> :
        <label className="block space-y-2 text-sm">
          <span>Ngày và giờ xử lý <span className="text-[var(--foreground-muted)]">({zone})</span></span>
          <input type="datetime-local" required value={value} disabled={busy}
            onChange={event => setValue(event.target.value)}
            className="focus-ring min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2" />
        </label>}
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p>}
  </Modal>
}
