'use client'

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { confirmCommitment, LedgerApiError, type CommitmentConfirmation } from '@/lib/commitments/client'
import type { CommitmentEvidence, CommitmentState } from '@/lib/commitments/contracts'
import {
  commitmentChanges, draftDeadline, localDeadline, sourceEmailId, statusLabels,
  type DueKind, type LedgerDetail, type LedgerRevision,
} from '@/lib/commitments/view'

const control = 'min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 py-2 text-base text-[var(--foreground)] sm:text-sm'
const labelStyle = 'block min-w-0 space-y-1 text-sm font-medium'

type EvidenceChoice = CommitmentEvidence & { subject: string; verified: boolean }
type Preview = {
  key: string
  command: CommitmentConfirmation
  changes: ReturnType<typeof commitmentChanges>
  sources: EvidenceChoice[]
}
type SaveError = { kind: 'validation' | 'conflict' | 'uncertain'; message: string }

function evidenceKey(source: CommitmentEvidence) {
  return JSON.stringify([source.emailId, source.field, source.quote])
}

export function CommitmentConfirmationDialog({ detail, history, onClose, onReload, onSaved }: {
  detail: LedgerDetail
  history: LedgerRevision[]
  onClose: () => void
  onReload: () => void
  onSaved: (version: number) => void
}) {
  const [base] = useState(detail)
  const [title, setTitle] = useState(base.state.title)
  const [ownerName, setOwnerName] = useState(base.state.ownerName ?? '')
  const [ownerEmail, setOwnerEmail] = useState(base.state.ownerEmail ?? '')
  const [status, setStatus] = useState(base.state.status)
  const [dueKind, setDueKind] = useState<DueKind>(base.state.dueAt ? 'time' : base.state.dueOn ? 'date' : 'none')
  const [due, setDue] = useState(base.state.dueAt ? localDeadline(base.state.dueAt) : base.state.dueOn ?? '')
  const [picked, setPicked] = useState<EvidenceChoice[]>([])
  const [addSource, setAddSource] = useState(false)
  const [sourceLink, setSourceLink] = useState('')
  const [quote, setQuote] = useState('')
  const [field, setField] = useState<CommitmentEvidence['field']>('body_text')
  const [formError, setFormError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const formId = useId()
  const candidates = useMemo(() => {
    const unique = new Map<string, EvidenceChoice>()
    for (const revision of history) {
      for (const source of revision.sources) {
        if (source.availability !== 'available' || !source.quote) continue
        const choice: EvidenceChoice = {
          emailId: source.emailId, field: source.field, quote: source.quote,
          subject: source.subject || 'Email nguồn', verified: true,
        }
        const key = evidenceKey(choice)
        if (!unique.has(key)) unique.set(key, choice)
      }
    }
    return [...unique.values()]
  }, [history])

  useEffect(() => {
    if (preview) reviewHeading.current?.focus()
  }, [preview])

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const state: CommitmentState = {
      title: title.trim(), ownerName: ownerName.trim() || null, ownerEmail: ownerEmail.trim() || null,
      status, ...draftDeadline(dueKind, due, base.state),
      ...(base.state.delivery && { delivery: base.state.delivery }),
    }
    if (state.status === 'completed' && state.delivery && state.delivery.delivered < state.delivery.ordered) {
      return setFormError('Ghi nhận email giao đủ số lượng trước khi khép cam kết.')
    }
    if (!state.title) return setFormError('Nhập nội dung cam kết.')
    const changes = commitmentChanges(base.state, state)
    if (!changes.length) return setFormError('Chỉnh ít nhất một trường trước khi xác nhận.')
    const sources = [...picked]
    if (addSource) {
      const id = sourceEmailId(sourceLink, window.location.origin)
      if (!id || !quote.trim()) return setFormError('Nhập liên kết Inbox hoặc mã email và trích đoạn nguyên văn.')
      sources.push({ emailId: id, field, quote, subject: 'Email vừa gắn', verified: false })
    }
    const unique = [...new Map(sources.map(source => [evidenceKey(source), source])).values()]
    if (!unique.length || unique.length > 3) return setFormError('Chọn từ một đến ba trích đoạn làm bằng chứng.')

    setSaveError(null)
    setPreview({
      key: crypto.randomUUID(), changes, sources: unique,
      command: {
        expectedVersion: base.version, state,
        evidence: unique.map(({ emailId, field, quote }) => ({ emailId, field, quote })),
      },
    })
  }

  async function save() {
    if (!preview || pending.current || saveError?.kind === 'conflict' || saveError?.kind === 'validation') return
    pending.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const receipt = await confirmCommitment(base.id, preview.key, preview.command)
      if (receipt.id !== base.id || !Number.isInteger(receipt.version) || receipt.version <= base.version) throw new Error('Invalid receipt')
      onSaved(receipt.version)
    } catch (error) {
      const status = error instanceof LedgerApiError ? error.status : null
      if (status === 409) {
        setSaveError({ kind: 'conflict', message: 'Cam kết đã thay đổi. Tải phiên bản mới để kiểm tra trước khi chỉnh lại.' })
      } else if (status === 400 || status === 401 || status === 404 || status === 422) {
        setSaveError({ kind: 'validation', message: error instanceof Error ? error.message : 'Chưa thể lưu thay đổi.' })
      } else {
        setSaveError({ kind: 'uncertain', message: 'Chưa xác nhận được kết quả lưu. Bạn có thể thử lại cùng yêu cầu.' })
      }
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  const canReturnToEdit = saveError?.kind !== 'uncertain' && saveError?.kind !== 'conflict'
  const close = () => {
    if (pending.current) return
    if (saveError?.kind === 'uncertain') onReload()
    else onClose()
  }
  return (
    <Modal open onClose={close} title={preview ? 'Xem trước thay đổi' : 'Xác nhận thay đổi'} size="2xl"
      description={base.state.title} showCloseButton={!saving} closeOnEscape={!saving} closeOnOverlayClick={!saving && !preview}
      footer={preview ? (
        <>
          <Button type="button" variant="ghost" onClick={close} disabled={saving}>
            {saveError?.kind === 'uncertain' ? 'Đóng và kiểm tra' : 'Đóng'}
          </Button>
          {saveError?.kind === 'conflict' ? (
            <Button type="button" onClick={onReload}>Bỏ bản chỉnh và tải mới</Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={saving || !canReturnToEdit}
                onClick={() => { setPreview(null); setSaveError(null) }}>Quay lại chỉnh</Button>
              <Button type="button" loading={saving} disabled={saveError?.kind === 'validation'} onClick={() => void save()}>
                {saveError?.kind === 'uncertain' ? 'Thử lưu lại' : 'Xác nhận và lưu'}
              </Button>
            </>
          )}
        </>
      ) : (
        <>
          <Button type="button" variant="outline" onClick={close}>Đóng</Button>
          <Button type="submit" form={formId}>Xem trước thay đổi</Button>
        </>
      )}>
      {preview ? (
        <div className="space-y-4">
          <h3 ref={reviewHeading} tabIndex={-1} className="text-sm font-semibold">Thay đổi so với phiên bản {base.version}</h3>
          <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {preview.changes.map(change => (
              <div key={change.field} className="grid gap-1 py-3 text-sm sm:grid-cols-[136px_1fr]">
                <dt className="font-medium">{change.field}</dt>
                <dd className="min-w-0 break-words">
                  <span className="text-[var(--foreground-muted)]">{change.from}</span>
                  <span aria-label="đổi thành"> → </span>
                  <span className="font-medium">{change.to}</span>
                </dd>
              </div>
            ))}
          </dl>
          <section aria-label="Email dùng để xác nhận">
            <h3 className="text-sm font-semibold">Email dùng để xác nhận</h3>
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {preview.sources.map(source => (
                <li key={evidenceKey(source)} className="py-2">
                  <p className="break-words text-sm font-medium">{source.subject}</p>
                  <blockquote className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--foreground-secondary)]">{source.quote}</blockquote>
                  {!source.verified && <p className="mt-1 text-xs text-[var(--foreground-muted)]">Trích đoạn sẽ được đối chiếu khi lưu.</p>}
                </li>
              ))}
            </ul>
          </section>
          {saveError && <Alert variant="error">{saveError.message}</Alert>}
        </div>
      ) : (
        <form id={formId} onSubmit={prepare} className="space-y-4">
          <label className={labelStyle}>Nội dung cam kết
            <input className={control} value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelStyle}>Tên người phụ trách
              <input className={control} value={ownerName} onChange={event => setOwnerName(event.target.value)} maxLength={120} />
            </label>
            <label className={labelStyle}>Email người phụ trách
              <input className={control} type="email" value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} maxLength={254} />
            </label>
            <label className={labelStyle}>Trạng thái
              <select className={control} value={status} onChange={event => setStatus(event.target.value as CommitmentState['status'])}>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className={labelStyle}>Loại hạn
              <select className={control} value={dueKind} disabled={!!base.state.delivery} onChange={event => {
                const kind = event.target.value as DueKind
                setDueKind(kind)
                setDue(kind === 'time' && base.state.dueAt ? localDeadline(base.state.dueAt) : kind === 'date' ? base.state.dueOn ?? '' : '')
              }}>
                <option value="none">Chưa có hạn</option>
                <option value="date">Theo ngày</option>
                <option value="time">Có giờ (UTC+7)</option>
              </select>
              {base.state.delivery && <span className="block text-xs text-[var(--foreground-muted)]">Duyệt đề xuất từ email nguồn để cập nhật hạn giao.</span>}
            </label>
            {dueKind !== 'none' && (
              <label className={labelStyle}>{dueKind === 'date' ? 'Ngày đến hạn' : 'Giờ đến hạn (UTC+7)'}
                <input className={control} type={dueKind === 'date' ? 'date' : 'datetime-local'}
                  step={dueKind === 'time' ? 1 : undefined} value={due} disabled={!!base.state.delivery} required onChange={event => setDue(event.target.value)} />
              </label>
            )}
          </div>
          <fieldset className="min-w-0 border-t border-[var(--border)]">
            <legend className="pe-3 text-sm font-semibold">Bằng chứng email</legend>
            <p className="mb-2 mt-2 text-xs text-[var(--foreground-muted)]">Chọn từ một đến ba trích đoạn phù hợp với thay đổi.</p>
            {candidates.length > 0 && (
              <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {candidates.map(source => {
                  const key = evidenceKey(source)
                  const selected = picked.some(item => evidenceKey(item) === key)
                  return (
                    <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 px-2 py-2 text-sm hover:bg-[var(--hover)]">
                      <input type="checkbox" checked={selected} disabled={!selected && picked.length >= 3}
                        className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                        onChange={() => setPicked(previous => selected ? previous.filter(item => evidenceKey(item) !== key) : [...previous, source])} />
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{source.subject}</span>
                        <span className="block whitespace-pre-wrap break-words text-xs text-[var(--foreground-muted)]">{source.quote}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            <label className="flex min-h-11 items-center gap-3 py-2 text-sm font-medium">
              <input type="checkbox" checked={addSource} onChange={event => setAddSource(event.target.checked)}
                className="size-4 accent-[var(--primary)]" /> Gắn email khác
            </label>
            {addSource && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelStyle}>Liên kết Inbox hoặc mã email
                  <input className={control} value={sourceLink} onChange={event => setSourceLink(event.target.value)} required maxLength={500} />
                </label>
                <label className={labelStyle}>Vị trí trích đoạn
                  <select className={control} value={field} onChange={event => setField(event.target.value as CommitmentEvidence['field'])}>
                    <option value="body_text">Nội dung văn bản</option>
                    <option value="subject">Tiêu đề</option>
                  </select>
                </label>
                <label className={`${labelStyle} sm:col-span-2`}>Trích đoạn nguyên văn
                  <textarea className={control} value={quote} onChange={event => setQuote(event.target.value)} rows={3} required maxLength={480} />
                </label>
              </div>
            )}
          </fieldset>
          {formError && <Alert variant="error">{formError}</Alert>}
        </form>
      )}
    </Modal>
  )
}
