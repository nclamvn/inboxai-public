'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { inboxBandLabels, type InboxRanking } from '@/lib/action-inbox/rank'
import type { InboxPriorityResult } from '@/hooks/use-emails'
import type { Email, InboxPriority } from '@/types'

const choices = [
  { key: 'automatic', value: null, label: 'Tự động' },
  { key: 'action', value: 'action', label: 'Cần xử lý' },
  { key: 'later', value: 'later', label: 'Đọc sau' },
] as const

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })

interface Props {
  email: Email
  ranking: InboxRanking
  onClose: () => void
  onOpenSource: (id: string) => void
  onSave: (id: string, choice: InboxPriority, version: number) => Promise<InboxPriorityResult>
}

export function InboxPriorityDialog({ email, ranking, onClose, onOpenSource, onSave }: Props) {
  const [choice, setChoice] = useState<InboxPriority>(email.inbox_priority ?? null)
  const [confirmed, setConfirmed] = useState({ choice: email.inbox_priority ?? null, version: email.inbox_priority_version ?? 0 })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ variant: 'success' | 'warning' | 'error'; text: string } | null>(null)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const result = await onSave(email.id, choice, confirmed.version)
      setConfirmed({ choice: result.choice, version: result.version })
      setMessage(result.status === 'conflict'
        ? { variant: 'warning', text: 'Ưu tiên vừa thay đổi ở phiên khác. Hãy kiểm tra lựa chọn hiện tại và lưu lại nếu muốn thay đổi.' }
        : { variant: 'success', text: 'Đã lưu ưu tiên.' })
    } catch {
      setMessage({ variant: 'error', text: 'Chưa xác nhận được thay đổi. Hãy kiểm tra kết nối và thử lưu lại.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open onClose={onClose} title="Ưu tiên và nguồn" size="md"
      description={email.subject || '(Không có tiêu đề)'}
      showCloseButton={!saving} closeOnEscape={!saving} closeOnOverlayClick={!saving}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Đóng</Button>
          <Button type="submit" form="inbox-priority-form" loading={saving} disabled={choice === confirmed.choice}>Lưu ưu tiên</Button>
        </>
      }
    >
      <section aria-label="Lý do xếp ưu tiên" className="border-s-2 border-[var(--selection-line)] ps-3">
        <p className="text-sm font-semibold text-[var(--accent-foreground)]">{inboxBandLabels[ranking.band]}</p>
        <ul className="mt-2 space-y-3">
          {ranking.reasons.map(reason => (
            <li key={reason.signal} className="text-sm">
              <p>{reason.label}</p>
              {reason.date && (
                <time dateTime={reason.date} className="text-xs text-[var(--foreground-muted)]">{dateFormat.format(new Date(reason.date))}</time>
              )}
              <ul className="mt-1">
                {reason.sources.map(source => (
                  <li key={source.emailId}>
                    {source.excerpt && (
                      <q className="block break-words text-xs text-[var(--foreground-muted)]">{source.excerpt}</q>
                    )}
                    <Link
                      href={`/inbox?email=${encodeURIComponent(source.emailId)}`}
                      onClick={event => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                        event.preventDefault()
                        onOpenSource(source.emailId)
                      }}
                      className="neo-target inline-flex max-w-full items-center gap-2 py-2 text-xs text-[var(--accent-foreground)] underline underline-offset-2"
                    >
                      <FileText size={16} aria-hidden="true" className="shrink-0" />
                      <span className="min-w-0 break-words">{source.subject || '(Không có tiêu đề)'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <form id="inbox-priority-form" className="mt-4 border-t border-[var(--border)] pt-4" onSubmit={event => {
        event.preventDefault()
        if (!saving && choice !== confirmed.choice) void save()
      }}>
        <fieldset disabled={saving} className="space-y-1">
          <legend className="text-sm font-semibold">Đổi ưu tiên</legend>
          <p className="text-xs text-[var(--foreground-muted)]">
            Hiện tại: {choices.find(option => option.value === confirmed.choice)?.label}
          </p>
          <div className="flex flex-wrap gap-x-4">
            {choices.map(option => (
              <label key={option.key} className="neo-target flex items-center gap-2 py-2 text-sm">
                <input
                  type="radio" name="inbox-priority" value={option.key}
                  className="size-4 accent-[var(--primary)]"
                  checked={choice === option.value} onChange={() => { setChoice(option.value); setMessage(null) }}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        {message && <Alert variant={message.variant} className="mt-3 p-2 text-sm">{message.text}</Alert>}
      </form>
    </Modal>
  )
}
