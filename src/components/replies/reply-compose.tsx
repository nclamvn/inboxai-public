'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, FileText, Send } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCommitmentMoment } from '@/lib/commitments/view'
import { gmailSendPermissionRequired } from '@/lib/gmail/scopes'
import { readReply, replyRequest, ReplyError, takeReplyText } from '@/lib/replies/client'
import type { ReplyDraft, ReplyFields, ReplyWorkbench } from '@/lib/replies/contracts'

const inputClass = 'w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm focus-ring'
const messageLink = 'neo-target inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const fieldsFor = (context: ReplyWorkbench): ReplyFields => ({
  to: context.draft?.to ?? context.to ?? '', cc: context.draft?.cc ?? '', body: context.draft?.body ?? '',
})
const equal = (a: ReplyFields, b: ReplyFields) => a.to === b.to && a.cc === b.cc && a.body === b.body

export function ReplyCompose({ source }: { source: string }) {
  const cache = useQueryClient()
  const [context, setContext] = useState<ReplyWorkbench | null>(null)
  const [draft, setDraft] = useState<ReplyDraft | null>(null)
  const [fields, setFields] = useState<ReplyFields>({ to: '', cc: '', body: '' })
  const [saved, setSaved] = useState<ReplyFields>(fields)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [readVersion, setReadVersion] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [followupOn, setFollowupOn] = useState('')
  const busyRef = useRef(false)
  const saveRef = useRef<Promise<ReplyDraft> | null>(null)
  const dirty = !equal(fields, saved)
  const editable = !draft || draft.state === 'draft'
  const stale = context?.stale && editable
  const invalidate = () => void cache.invalidateQueries({ queryKey: ['reply-work'] })

  function acceptContext(result: ReplyWorkbench, replaceFields: boolean) {
    setContext(result)
    setDraft(result.draft)
    if (replaceFields) {
      const next = fieldsFor(result)
      setFields(next)
      setSaved(next)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void readReply(source, controller.signal).then(result => {
      if (controller.signal.aborted) return
      acceptContext(result, true)
      const pending = takeReplyText(source)
      if (pending) setSuggestion(pending)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof ReplyError ? reason.message : 'Chưa thể mở email nguồn.')
    })
    return () => controller.abort()
  }, [source, readVersion])

  useEffect(() => {
    if (!dirty) return
    function preventLoss(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [dirty])

  async function save() {
    if (saveRef.current) return saveRef.current
    if (!context) throw new Error('Missing source')
    if (draft && !dirty) return draft
    setSaving(true)
    setError(null)
    const pending = replyRequest<ReplyDraft>({
      action: 'save', source, id: draft?.id ?? null, revision: draft?.revision ?? null,
      fingerprint: context.fingerprint, ...fields,
    })
    saveRef.current = pending
    try {
      const result = await pending
      setDraft(result)
      setSaved(fields)
      invalidate()
      return result
    } catch (reason) {
      if (reason instanceof ReplyError && reason.status === 409) setConflict(true)
      setError(reason instanceof ReplyError ? reason.message : 'Bản nháp chưa được lưu. Hãy thử lại khi có mạng.')
      throw reason
    } finally {
      saveRef.current = null
      setSaving(false)
    }
  }

  async function refresh() {
    acceptContext(await readReply(source, AbortSignal.timeout(10_000)), false)
    invalidate()
  }

  async function send(action: 'send' | 'check', current: ReplyDraft) {
    setPermission(false)
    const result = await replyRequest<{ state: ReplyDraft['state']; error?: string }>({ action, id: current.id })
    setError(result.error ?? null)
    // A second GET can fail after a successful send. The known receipt still
    // locks the draft immediately, and a reload restores the authoritative view.
    setDraft({ ...current, state: result.state })
    await refresh()
  }

  async function run(task: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (reason) {
      setPermission(reason instanceof ReplyError && reason.code === gmailSendPermissionRequired)
      setError(reason instanceof ReplyError ? reason.message : 'Mất kết nối. Mở lại bản nháp để kiểm tra trạng thái.')
      await refresh().catch(() => {})
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function approve() {
    if (!draft) return
    await run(async () => {
      const prepared = await replyRequest<ReplyDraft>({ action: 'prepare', id: draft.id, source, revision: draft.revision }).catch(reason => {
        if (reason instanceof ReplyError && reason.status === 409) {
          setPreview(false)
          setConflict(true)
        }
        throw reason
      })
      setDraft(prepared)
      setPreview(false)
      await send('send', prepared)
    })
  }

  function change(action: 'edit' | 'discard' | 'finish' | 'track') {
    if (!draft || !context) return
    void run(async () => {
      await replyRequest(action === 'track' && followupOn
        ? { action: 'schedule-followup', id: draft.id, on: followupOn, expected: null }
        : { action, id: draft.id, ...(action === 'edit' && { fingerprint: context.fingerprint }) })
      if (action === 'finish' || action === 'discard') {
        const next = await readReply(source)
        acceptContext({ ...next, draft: null, stale: false }, true)
      } else {
        acceptContext(await readReply(source), action === 'edit')
      }
      setConflict(false)
      invalidate()
    })
  }

  function review(event: React.FormEvent) {
    event.preventDefault()
    if (!editable || !fields.body.trim()) return
    void run(async () => {
      await save()
      setPreview(true)
    })
  }

  const back = '/inbox?email=' + encodeURIComponent(source)
  const state = draft?.state ?? 'draft'
  const status = state === 'accepted' ? 'Đã gửi' : state === 'partial' ? 'Chấp nhận một phần'
    : state === 'rejected' ? 'Yêu cầu bị từ chối' : state === 'unknown' || state === 'dispatching' ? 'Đang chờ xác minh'
    : state === 'prepared' ? 'Đã lưu yêu cầu gửi' : saving ? 'Đang lưu bản nháp…'
    : dirty ? 'Có thay đổi chưa lưu' : draft ? 'Bản nháp đã lưu' : null
  return (
    <div className="mx-auto min-h-full max-w-6xl bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
        <Link href={back} className={messageLink} onClick={event => {
          if (dirty && !window.confirm('Rời trang khi bản nháp còn thay đổi chưa lưu?')) event.preventDefault()
        }}><ArrowLeft size={16} aria-hidden="true" /> Về email nguồn</Link>
        <h1 className="neo-title mt-1 break-words">Trả lời hội thoại</h1>
        {context?.subject && <p className="mt-1 break-words text-sm text-[var(--foreground-secondary)]">{context.subject}</p>}
      </header>
      <div className="grid min-w-0 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">

        <div className="min-w-0 space-y-4 p-4 sm:p-6 lg:col-start-2 lg:row-start-1">
          {error && <Alert variant="error" title="Chưa hoàn tất thao tác">{error}</Alert>}
          {!context && !error && <p role="status">Đang mở hội thoại…</p>}
          {context && <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3 text-sm">
              <p className="min-w-0 break-all"><span className="font-semibold">Gửi từ</span> {context.account}</p>
              {status && <p role="status" className="text-[var(--foreground-secondary)]">{status}</p>}
            </div>
            {(stale || conflict) && <Alert variant="warning" title="Bản nháp cần đối chiếu">
              Hãy kiểm tra lại email nguồn và bản nháp đã lưu trước khi tiếp tục.
              <div className="mt-2 flex flex-wrap gap-2">
                {conflict && <Button type="button" variant="outline" onClick={() => {
                  if (!dirty || window.confirm('Mở bản nháp đã lưu và bỏ thay đổi chưa lưu?')) {
                    setConflict(false)
                    setError(null)
                    setReadVersion(version => version + 1)
                  }
                }}>Mở bản nháp đã lưu</Button>}
                {stale && draft && <Button type="button" variant="outline" disabled={busy} onClick={() => change('edit')}>
                  Dùng phiên bản email nguồn hiện tại
                </Button>}
              </div>
            </Alert>}
            <form onSubmit={review} className="space-y-4">
              <fieldset disabled={busy || !editable} className="space-y-4">
                <label className="block space-y-1 text-sm"><span>Người nhận</span>
                  <input className={inputClass} value={fields.to} onChange={event => setFields({ ...fields, to: event.target.value })} required maxLength={4000} />
                </label>
                <label className="block space-y-1 text-sm"><span>Cc</span>
                  <input className={inputClass} value={fields.cc} onChange={event => setFields({ ...fields, cc: event.target.value })} maxLength={4000} />
                </label>
                {suggestion && editable && <div className="border-s-2 border-[var(--accent)] ps-3">
                  <p className="whitespace-pre-wrap break-words text-sm">{suggestion}</p>
                  <Button type="button" variant="outline" className="mt-2" onClick={() => {
                    setFields({ ...fields, body: fields.body ? fields.body + '\n\n' + suggestion : suggestion })
                    setSuggestion(null)
                  }}>Chèn gợi ý vào bản nháp</Button>
                </div>}
                <label className="block space-y-1 text-sm"><span>Nội dung thư</span>
                  <textarea className={inputClass + ' min-h-48 resize-y'} value={fields.body} maxLength={100000}
                    onChange={event => setFields({ ...fields, body: event.target.value })} />
                </label>
              </fieldset>
              {draft && state === 'accepted' && !draft.tracking && <label className="block max-w-64 space-y-1 text-sm">
                <span>Ngày kiểm tra lại (giờ Việt Nam)</span>
                <input type="date" value={followupOn} onChange={event => setFollowupOn(event.target.value)}
                  disabled={busy} className={inputClass} />
              </label>}
              <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                {editable && <>
                  <Button type="button" variant="outline" disabled={busy || saving || !!stale || conflict || !dirty}
                    onClick={() => void save().catch(() => {})}>Lưu bản nháp</Button>
                  <Button type="submit" disabled={busy || saving || !!stale || conflict || !fields.body.trim()} leftIcon={<Send size={16} aria-hidden="true" />}>
                    Xem trước thư gửi
                  </Button>
                  {draft && <Button type="button" variant="ghost" disabled={busy || saving} onClick={() => setConfirmDiscard(true)}>Xóa bản nháp</Button>}
                </>}
                {draft && (state === 'prepared' || state === 'unknown' || state === 'dispatching') && <>
                  <Button type="button" loading={busy} onClick={() => void run(() => send('check', draft))}>Kiểm tra trạng thái gửi</Button>
                  {state === 'prepared' && <Button type="button" variant="outline" disabled={busy}
                    onClick={() => void run(() => send('send', draft))}>Tiếp tục gửi thư đã duyệt</Button>}
                </>}
                {draft && (state === 'rejected' || state === 'prepared') && <Button type="button" variant="ghost" disabled={busy}
                  onClick={() => change('edit')}>Mở lại bản nháp để chỉnh sửa</Button>}
                {permission && <Link href="/settings" className={messageLink}>Cài đặt quyền gửi</Link>}
                {draft && state === 'accepted' && !draft.tracking && <Button type="button" loading={busy}
                  onClick={() => change('track')} leftIcon={<Check size={16} aria-hidden="true" />}>Theo dõi hồi đáp</Button>}
                {draft?.tracking && <p role="status" className="py-2 text-sm">Đang theo dõi hồi đáp</p>}
                {draft?.sentId && <Link href={'/inbox?email=' + draft.sentId} className={messageLink}>Mở thư đã gửi</Link>}
                {draft && (state === 'accepted' || state === 'partial') && <Button type="button" variant="outline" disabled={busy}
                  onClick={() => change('finish')}>Soạn phản hồi mới</Button>}
              </div>
            </form>
          </>}
        </div>
        {context && <section aria-label="Hội thoại" className="border-t border-[var(--border)] lg:col-start-1 lg:row-start-1 lg:border-e lg:border-t-0">
          <h2 className="px-4 pt-4 text-sm font-semibold sm:px-6">Hội thoại</h2>
          <ol className="divide-y divide-[var(--border)]">
            {context.thread.map(message => <li key={message.id} className="px-4 py-3 sm:px-6">
              <Link href={'/inbox?email=' + message.id} className={messageLink} onClick={event => {
                if (dirty && !window.confirm('Rời trang khi bản nháp còn thay đổi chưa lưu?')) event.preventDefault()
              }}><FileText size={15} aria-hidden="true" className="shrink-0" /><span className="break-all">{message.sender}</span></Link>
              <p className="break-words text-xs text-[var(--foreground-secondary)]">
                {message.source ? 'Email đang trả lời' : message.subject}{message.at ? ' · ' + formatCommitmentMoment(message.at) : ''}
              </p>
              {message.snippet && <p className="mt-2 break-words text-sm">{message.snippet}</p>}
            </li>)}
          </ol>
        </section>}
      </div>
      {preview && context && draft && <Modal open title="Xem trước thư gửi" description={draft.subject}
        onClose={() => { if (!busy) setPreview(false) }} showCloseButton={!busy} closeOnEscape={!busy}
        footer={<><Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(false)}>Quay lại</Button>
          <Button type="button" loading={busy} onClick={() => void approve()}>Xác nhận gửi</Button></>}>
        <dl className="space-y-2 break-words text-sm">
          <div><dt className="font-semibold">Gửi từ</dt><dd>{context.account}</dd></div>
          <div><dt className="font-semibold">Người nhận</dt><dd>{draft.to}</dd></div>
          {draft.cc && <div><dt className="font-semibold">Cc</dt><dd>{draft.cc}</dd></div>}
        </dl>
        <p className="mt-4 whitespace-pre-wrap break-words border-t border-[var(--border)] pt-4 text-sm">{draft.body}</p>
        {error && <div className="mt-4"><Alert variant="error" title="Chưa xác nhận được thao tác">{error}</Alert></div>}
      </Modal>}
      {confirmDiscard && <Modal open title="Xóa bản nháp?" description="Bản nháp đã lưu và thay đổi đang soạn sẽ bị xóa."
        onClose={() => setConfirmDiscard(false)} footer={<>
          <Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>Giữ bản nháp</Button>
          <Button type="button" variant="danger" onClick={() => { setConfirmDiscard(false); change('discard') }}>Xóa bản nháp</Button>
        </>} />}
    </div>
  )
}
