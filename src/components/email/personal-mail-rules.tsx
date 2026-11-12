'use client'

import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { MailCategoryLabel, mailCategoryLabels } from './mail-category-label'
import { ruleCategories, type MailRule, type MailRulePreview, type RuleCategory } from '@/lib/personal-mail/contracts'
import type { Email } from '@/types'

const endpoint = '/api/personal-mail-rules'

async function request<T>(command?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(endpoint, command
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) }
    : { signal })
  const data = await response.json()
  if (!response.ok) throw new RuleRequestError(data.error, response.status)
  return data
}

class RuleRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function errorText(error: unknown) {
  return error instanceof RuleRequestError ? error.message : 'Mất kết nối. Bạn có thể thử lại.'
}

export function MailCategoryDialog({ email, onClose, onSaved }: {
  email: Email
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const fieldId = useId()
  const [category, setCategory] = useState<RuleCategory | ''>(
    ruleCategories.find(value => value === email.category) ?? '',
  )
  const [preview, setPreview] = useState<(MailRulePreview & { requestId: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canCreateRule = email.sync_namespace === 'gmail' && email.direction === 'inbound'
  const scope = { emailId: email.id, category }

  async function execute(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (cause) {
      setError(errorText(cause))
      if (cause instanceof RuleRequestError && cause.status === 409) setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  function loadPreview(includeExisting: boolean) {
    void execute(async () => {
      const result = await request<MailRulePreview>({ action: 'preview', ...scope, includeExisting })
      setPreview({ ...result, requestId: crypto.randomUUID() })
    })
  }

  function saveOne() {
    void execute(async () => {
      await request<number>({ action: 'manual', ...scope })
      onSaved('Đã đổi nhãn cho thư này.')
    })
  }

  function confirm() {
    if (!preview) return
    void execute(async () => {
      const rule = await request<MailRule>({
        action: 'confirm', ...scope, includeExisting: preview.includeExisting, token: preview.token, id: preview.requestId,
      })
      onSaved(rule.applied ? `Đã tạo quy tắc và đổi nhãn cho ${rule.applied} thư.` : 'Đã tạo quy tắc cho thư mới.')
    })
  }

  return (
    <Modal open title={preview ? 'Xem trước quy tắc' : 'Đổi nhãn thư'} size="lg"
      onClose={onClose} showCloseButton={!busy} closeOnEscape={!busy} closeOnOverlayClick={!busy}
      footer={preview ? <>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setPreview(null); setError('') }}>Quay lại</Button>
        <Button type="button" loading={busy} disabled={preview.items.length > 200} onClick={confirm}>Tạo quy tắc</Button>
      </> : <>
        {canCreateRule && <Button type="button" variant="outline" disabled={busy || !category} onClick={() => loadPreview(true)}>Xem trước quy tắc</Button>}
        <Button type="button" loading={busy} disabled={!category} onClick={saveOne}>Chỉ đổi thư này</Button>
      </>}
    >
      {preview ? <>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--foreground-muted)]">Tài khoản</dt><dd className="break-all">{preview.account}</dd>
          <dt className="text-[var(--foreground-muted)]">Người gửi</dt><dd className="break-all">{preview.sender}</dd>
          <dt className="text-[var(--foreground-muted)]">Nhãn mới</dt><dd><MailCategoryLabel category={preview.category} /></dd>
        </dl>
        <p className="mt-3 text-sm text-[var(--foreground-muted)]">Thư có cảnh báo khẩn vẫn hiện trong Cần xử lý.</p>
        <label className="neo-target mt-4 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={preview.includeExisting} disabled={busy}
            onChange={event => loadPreview(event.currentTarget.checked)} className="size-4 shrink-0 accent-[var(--primary)]" />
          Áp dụng cả cho thư đang có trong Hộp thư
        </label>
        {preview.items.length > 200 ? (
          <p className="mt-2 text-sm text-[var(--error)]">Có hơn 200 thư phù hợp. Bỏ chọn thư đang có để tạo quy tắc cho thư mới.</p>
        ) : preview.includeExisting ? (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-sm font-semibold" aria-live="polite">{preview.items.length} thư sẽ được gán nhãn</p>
            {preview.items.length > 0 && (
              <ul tabIndex={0} aria-label="Thư trong phạm vi" className="mt-2 max-h-52 divide-y divide-[var(--border)] overflow-y-auto">
                {preview.items.map(item => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 break-words">{item.subject || '(Không có tiêu đề)'}</span>
                    <MailCategoryLabel category={item.category} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : <p className="mt-2 text-sm text-[var(--foreground-muted)]">Quy tắc chỉ áp dụng cho thư mới.</p>}
      </> : (
        <>
          <p className="break-words text-sm text-[var(--foreground-secondary)]">{email.subject || '(Không có tiêu đề)'}</p>
          <label htmlFor={fieldId} className="mt-4 block text-sm font-medium">Nhãn mới</label>
          <select id={fieldId} value={category} onChange={event => setCategory(event.currentTarget.value as RuleCategory)}
            disabled={busy} className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm">
            <option value="" disabled>Chọn nhãn</option>
            {ruleCategories.map(value => <option key={value} value={value}>{mailCategoryLabels[value]}</option>)}
          </select>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p>}
    </Modal>
  )
}

export function MailRulesDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rules, setRules] = useState<MailRule[] | null>(null)
  const [pending, setPending] = useState<MailRule | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void request<MailRule[]>(undefined, controller.signal).then(setRules).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause))
    })
    return () => controller.abort()
  }, [attempt])

  async function undo() {
    if (!pending) return
    setLoading(true)
    setError('')
    try {
      const changed = await request<MailRule>({ action: 'undo', id: pending.id })
      setRules(previous => previous?.map(rule => rule.id === changed.id ? changed : rule) ?? [])
      setPending(null)
      onChanged()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title="Quy tắc phân luồng" size="lg" onClose={onClose}
      showCloseButton={!loading} closeOnEscape={!loading} closeOnOverlayClick={!loading}
      footer={pending && <>
        <Button type="button" variant="outline" disabled={loading} onClick={() => { setPending(null); setError('') }}>Quay lại</Button>
        <Button type="button" loading={loading} onClick={() => void undo()}>Xác nhận hoàn tác</Button>
      </>}
    >
      {pending ? (
        <div className="space-y-2 text-sm">
          <p className="break-all font-semibold">{pending.sender} · {pending.account}</p>
          <p>Quy tắc sẽ ngừng áp dụng cho thư mới. Các nhãn do quy tắc gán sẽ được gỡ và nhãn bạn đã sửa tay sẽ được giữ lại.</p>
        </div>
      ) : rules?.length ? (
        <ul className="divide-y divide-[var(--border)]">
          {rules.map(rule => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><strong className="break-all">{rule.sender}</strong><MailCategoryLabel category={rule.category} /></p>
                <p className="mt-1 break-all text-[var(--foreground-muted)]">{rule.account}</p>
                {rule.undone && <p role="status" className="mt-1 text-[var(--foreground-muted)]">
                  Đã hoàn tác {rule.restored} thư · Giữ {rule.kept} thư đã sửa tay
                </p>}
              </div>
              {!rule.undone && <Button type="button" variant="outline" onClick={() => setPending(rule)}>Hoàn tác quy tắc</Button>}
            </li>
          ))}
        </ul>
      ) : (
        !error && <p role="status" className="text-sm text-[var(--foreground-muted)]">{rules ? 'Chưa có quy tắc.' : 'Đang tải quy tắc…'}</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p>}
      {error && !rules && <Button type="button" variant="outline" className="mt-3" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Tải lại</Button>}
    </Modal>
  )
}
