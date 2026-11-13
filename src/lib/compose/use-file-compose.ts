'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { composeDraftAction, composeRequest, fileDraftHref } from './client'
import type { ComposeFields, ComposeFile, FileComposeDraft, SourceFile } from './contracts'
import { ReplyError } from '@/lib/replies/client'
import { gmailSendPermissionRequired } from '@/lib/gmail/scopes'

type DraftEntry = Pick<FileComposeDraft, 'id' | 'sourceId'> & { subject: string }
type Original = { subject: string; body_text: string | null; source_account_id: string; from_address?: string }

export function useFileCompose(draftId: string | null, forwardId: string | null, applyFields: (fields: ComposeFields, account: string) => void) {
  const router = useRouter()
  const [draft, setDraft] = useState<FileComposeDraft | null>(null)
  const [files, setFiles] = useState<ComposeFile[]>([])
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [preview, setPreview] = useState<FileComposeDraft | null>(null)
  const [loading, setLoading] = useState(!!(draftId || forwardId))
  const [busy, setBusy] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState(false)
  const [reload, setReload] = useState(0)
  const active = useRef(false)
  const ownNavigation = useRef<string | null>(null)
  const hadContext = useRef(false)
  const apply = useRef(applyFields)

  useEffect(() => {
    if (draftId || forwardId) return
    const controller = new AbortController()
    void composeRequest<DraftEntry[]>('/api/compose-drafts', { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && Array.isArray(result)) setEntries(result)
    }).catch(() => {})
    return () => controller.abort()
  }, [draftId, forwardId])

  useEffect(() => {
    if (!draftId && !forwardId) {
      if (!hadContext.current) return
      hadContext.current = false
      setDraft(null)
      setFiles([])
      setSourceFiles([])
      setPreview(null)
      setLoading(false)
      setBlocked(false)
      setError(null)
      setPermission(false)
      apply.current({ to: '', cc: '', subject: '', body: '' }, '')
      return
    }
    hadContext.current = true
    if (draftId && ownNavigation.current === draftId) {
      ownNavigation.current = null
      return
    }
    const controller = new AbortController()
    const request = { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) }
    async function load() {
      setLoading(true)
      setBlocked(false)
      setError(null)
      try {
        const restored = draftId ? await composeRequest<FileComposeDraft>('/api/compose-drafts?id=' + encodeURIComponent(draftId), request) : null
        if (controller.signal.aborted) return
        setDraft(restored)
        setFiles(restored?.files ?? [])
        setSourceFiles([])
        if (restored) apply.current(restored.fields, restored.accountId)
        const source = restored ? restored.sourceId : forwardId
        if (source && (!restored || restored.state === 'draft')) {
          const url = '/api/emails/' + encodeURIComponent(source)
          const [original, attachments] = await Promise.all([
            restored ? null : composeRequest<{ email: Original }>(url, request),
            composeRequest<{ attachments: SourceFile[] }>(url + '/attachments', request),
          ])
          if (controller.signal.aborted) return
          setSourceFiles(attachments.attachments.filter(file => !file.is_inline))
          if (original) {
            const email = original.email
            const subject = /^fwd?:/i.test(email.subject) ? email.subject : 'Fwd: ' + email.subject
            const body = '\n\n--- Thư chuyển tiếp ---\nTừ: ' + (email.from_address ?? '') + '\nTiêu đề: ' + email.subject + '\n\n' + (email.body_text ?? '')
            apply.current({ to: '', cc: '', subject: subject.slice(0, 500), body: body.slice(0, 100_000) }, email.source_account_id)
          }
        }
      } catch (reason) {
        if (controller.signal.aborted) return
        setBlocked(true)
        setError(reason instanceof ReplyError ? reason.message : 'Chưa thể mở bản nháp hoặc thư chuyển tiếp.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [draftId, forwardId, reload])

  function reopen() {
    setPreview(null)
    setReload(value => value + 1)
  }

  async function run(work: () => Promise<void>) {
    if (active.current || fileBusy || loading || blocked) return
    active.current = true
    setBusy(true)
    setError(null)
    setPermission(false)
    try {
      await work()
    } catch (reason) {
      setPermission(reason instanceof ReplyError && reason.code === gmailSendPermissionRequired)
      setError(reason instanceof ReplyError ? reason.message : 'Mất kết nối. Mở lại bản nháp để kiểm tra trạng thái.')
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  function save(fields: ComposeFields, accountId: string, review = false) {
    return run(async () => {
      const openedAt = window.location.href
      const saved = await composeDraftAction({ action: 'save', id: draft?.id ?? null, revision: draft?.revision ?? null,
        sourceId: draft ? draft.sourceId : forwardId, accountId, fields, fileIds: files.map(file => file.id) })
      if (window.location.href !== openedAt) return
      setDraft(saved)
      if (!draftId) {
        ownNavigation.current = saved.id
        window.history.replaceState(null, '', fileDraftHref(saved.id))
      }
      if (review) setPreview(saved)
    })
  }

  async function submit(action: 'send' | 'check', current: FileComposeDraft) {
    try {
      const receipt = await composeDraftAction<{ state: string; error?: string }>({ action, id: current.id })
      if (receipt.state !== 'accepted') throw new ReplyError(receipt.error ?? 'Chưa xác nhận được kết quả gửi.', 202)
      setDraft({ ...current, state: 'accepted' })
      router.push('/sent')
    } catch (reason) {
      // A failed HTTP response can still carry a durable outcome. Refresh
      // without redispatching, and retain the approved snapshot when offline.
      const latest = await composeRequest<FileComposeDraft>('/api/compose-drafts?id=' + encodeURIComponent(current.id)).catch(() => null)
      if (latest) setDraft(latest)
      throw reason
    }
  }

  function approve() {
    if (!preview) return
    return run(async () => {
      const prepared = await composeDraftAction({ action: 'prepare', id: preview.id, revision: preview.revision }).catch(reason => {
        setPreview(null)
        if (!(reason instanceof ReplyError) || reason.status === 409 || reason.status >= 500) setBlocked(true)
        throw reason
      })
      setDraft(prepared)
      setPreview(null)
      await submit('send', prepared)
    })
  }

  function change(action: 'edit' | 'discard') {
    if (!draft) return
    return run(async () => {
      const next = await composeDraftAction({ action, id: draft.id })
      if (action === 'discard') router.push('/inbox')
      else setDraft(next)
    })
  }

  return { draft, files, setFiles, sourceFiles, entries, preview, setPreview, loading, busy, fileBusy, setFileBusy,
    blocked, error, permission, reopen, save, approve, change,
    send: (action: 'send' | 'check') => draft && run(() => submit(action, draft)) }
}
