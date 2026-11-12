'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ReplyError, replyRequest } from '@/lib/replies/client'
import type { ReplyFollowupPreview, ReplyWork } from '@/lib/replies/contracts'

export function ReplyFollowupDialog({ item, mode, onClose, onChange }: {
  item: ReplyWork
  mode: 'date' | 'preview' | 'check'
  onClose: () => void
  onChange: () => void
}) {
  const [date, setDate] = useState(item.followupOn ?? '')
  const [preview, setPreview] = useState<ReplyFollowupPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(mode === 'preview')
  const [needsCheck, setNeedsCheck] = useState(mode === 'check')
  const pending = useRef(mode === 'preview')
  const form = useId()
  const title = mode === 'date' ? 'Ngày kiểm tra lại' : needsCheck ? 'Kiểm tra thư nhắc' : 'Xem trước thư nhắc'

  useEffect(() => {
    if (mode !== 'preview') return
    let open = true
    void replyRequest<ReplyFollowupPreview>({ action: 'preview-followup', id: item.id }).then(result => {
      if (open) setPreview(result)
    }).catch(reason => {
      if (open) setError(reason instanceof ReplyError ? reason.message : 'Chưa tải được thư nhắc. Hãy thử lại.')
    }).finally(() => {
      if (!open) return
      pending.current = false
      setBusy(false)
    })
    return () => { open = false }
  }, [item.id, mode])

  async function run(work: () => Promise<void>, sending = false) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (reason) {
      if (reason instanceof ReplyError) {
        setError(reason.message)
        if (sending) setPreview(null)
      } else {
        if (sending) setNeedsCheck(true)
        setError(sending ? 'Mất kết nối. Hãy kiểm tra lượt gửi vừa xác nhận.' : 'Mất kết nối. Hãy thử lại.')
      }
    } finally {
      pending.current = false
      setBusy(false)
      onChange()
    }
  }

  function loadPreview() {
    void run(async () => {
      const result = await replyRequest<ReplyFollowupPreview>({ action: 'preview-followup', id: item.id })
      setPreview(result)
    })
  }

  function send(check: boolean) {
    const action = check ? { action: 'check-followup', id: item.id }
      : preview && { action: 'send-followup', id: item.id, key: preview.key, proof: preview.proof }
    if (!action) return
    void run(async () => {
      const result = await replyRequest<{ state: string; error?: string }>(action)
      if (result.state === 'accepted') {
        onClose()
      } else {
        setNeedsCheck(true)
        setError(result.error ?? 'Chưa xác nhận được kết quả gửi.')
      }
    }, !check)
  }

  return (
    <Modal open title={title} description={item.subject} onClose={() => { if (!pending.current) onClose() }}
      showCloseButton={!busy} closeOnEscape={!busy} closeOnOverlayClick={!busy} footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Đóng</Button>
        {mode === 'date' ? (
          <Button type="submit" form={form} loading={busy} disabled={!date}>Lưu ngày kiểm tra</Button>
        ) : needsCheck ? (
          <Button type="button" loading={busy} onClick={() => send(true)}>Kiểm tra trạng thái gửi</Button>
        ) : preview ? (
          <Button type="button" loading={busy} onClick={() => send(false)}>Xác nhận gửi thư nhắc</Button>
        ) : (
          <Button type="button" loading={busy} onClick={loadPreview}>Tải bản xem trước</Button>
        )}
      </>}>
      {mode === 'date' && <form id={form} onSubmit={event => {
        event.preventDefault()
        void run(async () => {
          await replyRequest({ action: 'schedule-followup', id: item.id, on: date, expected: item.followupKey })
          onClose()
        })
      }}>
        <label className="block space-y-2 text-sm">
          <span>Ngày kiểm tra lại (giờ Việt Nam)</span>
          <input type="date" required disabled={busy} value={date} onChange={event => setDate(event.target.value)}
            className="focus-ring w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2" />
        </label>
      </form>}
      {preview && !needsCheck && <>
        <dl className="space-y-2 break-words text-sm">
          <div><dt className="font-semibold">Gửi từ</dt><dd>{preview.from.address}</dd></div>
          <div><dt className="font-semibold">Người nhận</dt><dd>{preview.to.join(', ')}</dd></div>
          {preview.cc.length > 0 && <div><dt className="font-semibold">Cc</dt><dd>{preview.cc.join(', ')}</dd></div>}
        </dl>
        <p className="mt-4 whitespace-pre-wrap break-words border-t border-[var(--border)] pt-4 text-sm">{preview.text}</p>
        <Link href={'/inbox?email=' + preview.sourceId}
          className="neo-target mt-2 inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline">
          Mở thư đã gửi
        </Link>
      </>}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p>}
    </Modal>
  )
}
