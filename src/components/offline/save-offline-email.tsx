'use client'

import { useEffect, useState } from 'react'
import { Download, Check } from 'lucide-react'
import { readReply } from '@/lib/replies/client'
import { offlineReplyFor, type OfflineMail } from '@/lib/offline/contracts'
import type { Email } from '@/types'
import { offlineHome, useOfflineWorkspace } from './offline-provider'

function mailText(email: Email) {
  if (email.body_text?.trim()) return email.body_text.slice(0, 100_000)
  if (!email.body_html) return email.snippet ?? ''
  // A template is inert. Copy its text and omit scripts, styles and remote media.
  const content = document.createElement('template')
  content.innerHTML = email.body_html.replace(/<br\s*\/?>|<\/(?:p|div|tr|li)>/gi, '\n')
  for (const element of content.content.querySelectorAll('script,style,template,noscript')) element.remove()
  return (content.content.textContent ?? '').trim().slice(0, 100_000)
}

export function SaveOfflineEmail({ email }: { email: Email }) {
  const offline = useOfflineWorkspace()
  const vault = offline?.vault
  const [stored, setStored] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (vault) void vault.get<OfflineMail>('mail', email.id).then(value => {
      if (active) setStored(Boolean(value))
    }).catch(() => {})
    return () => { active = false }
  }, [email.id, vault])

  if (!offline?.scope || email.user_id !== offline.owner || email.provider_deleted || email.is_deleted) return null

  async function save() {
    setBusy(true)
    setError('')
    try {
      const active = await offline?.requestVault()
      if (!active || active.owner !== email.user_id) return
      if (await active.get<OfflineMail>('mail', email.id)) {
        setStored(true)
        return
      }
      const context = email.direction === 'inbound' && email.source_account_id
        ? await readReply(email.id, AbortSignal.timeout(8_000)).catch(() => null) : null
      const reply = context && (!context.draft || context.draft.state === 'draft') && !context.stale
        ? offlineReplyFor(context, { to: context.draft?.to ?? context.to, cc: context.draft?.cc ?? '', body: context.draft?.body ?? '' })
        : null
      const mail: OfflineMail = {
        subject: email.subject || '(Không có tiêu đề)', sender: email.from_name || email.from_address,
        at: email.received_at, text: mailText(email), reply,
      }
      await active.put('mail', email.id, mail)
      setStored(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được thư trên thiết bị.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="mt-2 flex flex-wrap items-center gap-x-3">
    {stored ? <>
      <span role="status" className="inline-flex items-center gap-2 text-sm text-[var(--success)]">
        <Check size={16} aria-hidden="true" /> Đã lưu đọc ngoại tuyến
      </span>
      <a className="neo-target inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline"
        href={offlineHome + '?' + new URLSearchParams({ email: email.id })}>Mở bản trên thiết bị</a>
    </> : <button type="button" disabled={busy} onClick={() => void save()}
      className="neo-target inline-flex min-h-11 items-center gap-2 text-sm text-[var(--accent-foreground)] underline">
      <Download size={16} aria-hidden="true" /> Lưu đọc ngoại tuyến
    </button>}
    {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
  </div>
}
