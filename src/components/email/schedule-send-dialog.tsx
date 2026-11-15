'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { localDateTimeInput } from '@/lib/email-local-time'
import { ReplyError } from '@/lib/replies/client'

export function ScheduleSendDialog({ mode, subject, sendAt, children, onClose, onSave }: {
  mode: 'schedule' | 'move' | 'cancel'
  subject: string
  sendAt?: string
  children?: ReactNode
  onClose: () => void
  onSave: (at: string | null, requestId: string) => Promise<void>
}) {
  const [value, setValue] = useState(() => localDateTimeInput(new Date(sendAt ?? Date.now() + 3600_000)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const receipt = useRef<{ at: string | null; id: string } | null>(null)
  const formId = useId()
  const cancel = mode === 'cancel'
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  async function save() {
    if (pending.current) return
    const date = new Date(value)
    if (!cancel && (Number.isNaN(date.getTime()) || localDateTimeInput(date) !== value || date.getTime() <= Date.now())) {
      setError('Chọn ngày và giờ gửi hợp lệ trong tương lai.')
      return
    }
    const at = cancel ? null : date.toISOString()
    if (!receipt.current || receipt.current.at !== at) receipt.current = { at, id: crypto.randomUUID() }
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await onSave(at, receipt.current.id)
    } catch (reason) {
      setError(reason instanceof ReplyError ? reason.message : 'Mất kết nối. Hãy thử lại hoặc kiểm tra mục Chờ gửi.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <Modal open title={cancel ? 'Hủy lịch gửi' : mode === 'move' ? 'Dời lịch gửi' : 'Lên lịch gửi'}
    description={subject} onClose={() => { if (!pending.current) onClose() }} closeOnEscape={!busy}
    closeOnOverlayClick={!busy} showCloseButton={!busy} footer={<>
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Quay lại</Button>
      <Button type="submit" form={formId} loading={busy}>
        {cancel ? 'Xác nhận hủy lịch' : mode === 'move' ? 'Lưu giờ mới' : 'Xác nhận lên lịch'}
      </Button>
    </>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      {cancel ? <p className="text-sm">Thư sẽ trở về bản nháp để bạn chỉnh sửa.</p> :
        <label className="block space-y-2 text-sm">
          <span>Ngày và giờ gửi <span className="text-[var(--foreground-muted)]">({zone})</span></span>
          <input type="datetime-local" required value={value} disabled={busy}
            onChange={event => { setValue(event.target.value); setError(null) }}
            className="focus-ring min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2" />
        </label>}
    </form>
    {children && <div className="mt-4">{children}</div>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p>}
  </Modal>
}
