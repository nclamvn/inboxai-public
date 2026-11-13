'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { composeDraftAction, composeRequest, fileDraftHref } from './client'
import type { ComposeFields, ComposeFile, FileComposeDraft, SourceFile } from './contracts'
import { ReplyError } from '@/lib/replies/client'
import { gmailSendPermissionRequired } from '@/lib/gmail/scopes'

type DraftEntry = Pick<FileComposeDraft, 'id' | 'sourceId'> & { subject: string }
type SaveSnapshot = { sourceId: string | null; accountId: string; fields: ComposeFields; fileIds: string[] }
const addressList = (value: string) => value.split(',').map(address => address.trim()).filter(Boolean).join(', ')
export const sameComposeFields = (a: ComposeFields, b: ComposeFields) =>
  addressList(a.to) === addressList(b.to) && addressList(a.cc) === addressList(b.cc) &&
  a.subject === b.subject && a.body === b.body

const matches = (draft: FileComposeDraft, snapshot: SaveSnapshot) =>
  draft.state === 'draft' && draft.accountId === snapshot.accountId && draft.sourceId === snapshot.sourceId &&
  sameComposeFields(draft.fields, snapshot.fields) && draft.files.length === snapshot.fileIds.length &&
  draft.files.every((file, index) => file.id === snapshot.fileIds[index])

type Original = { subject: string; body_text: string | null; source_account_id: string; from_address?: string }

export function useFileCompose(draftId: string | null, forwardId: string | null, applyFields: (fields: ComposeFields, account: string) => void) {
  const router = useRouter()
  const [draft, setDraft] = useState<FileComposeDraft | null>(null)
  const [files, setFiles] = useState<ComposeFile[]>([])
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [preview, setPreview] = useState<FileComposeDraft | null>(null)
  const [loading, setLoading] = useState(!!(draftId || forwardId))
  const [initial, setInitial] = useState<{ fields: ComposeFields; account: string } | null>(null)
  const [conflict, setConflict] = useState<FileComposeDraft | null>(null)
  const [saveUnconfirmed, setSaveUnconfirmed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const first = useRef<{ clientId: string; snapshot: SaveSnapshot } | null>(null)
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
      first.current = null
      setInitial(null)
      setConflict(null)
      setSaveFailed(false)
      setSaveUnconfirmed(false)
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
    first.current = null
    setInitial(null)
    setConflict(null)
    setSaveFailed(false)
    setSaveUnconfirmed(false)
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
            const fields = { to: '', cc: '', subject: subject.slice(0, 500), body: body.slice(0, 100_000) }
            setInitial({ fields, account: email.source_account_id })
            apply.current(fields, email.source_account_id)
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

  useEffect(() => {
    function resume() { setSaveFailed(false) }
    window.addEventListener('online', resume)
    return () => window.removeEventListener('online', resume)
  }, [])

  async function run(work: () => Promise<void>, automatic = false) {
    if (active.current || fileBusy || loading || blocked) return
    active.current = true
    const setWorking = automatic ? setAutoSaving : setBusy
    setWorking(true)
    setError(null)
    setPermission(false)
    try {
      await work()
    } catch (reason) {
      setPermission(reason instanceof ReplyError && reason.code === gmailSendPermissionRequired)
      setError(reason instanceof ReplyError ? reason.message : 'Mất kết nối. Mở lại bản nháp để kiểm tra trạng thái.')
    } finally {
      active.current = false
      setWorking(false)
    }
  }

  function save(fields: ComposeFields, accountId: string, review = false, automatic = false) {
    if (conflict) return
    return run(async () => {
      const openedAt = window.location.href
      const snapshot = { sourceId: draft ? draft.sourceId : forwardId, accountId, fields, fileIds: files.map(file => file.id) }
      const creation = draft ? null : (first.current ??= { clientId: crypto.randomUUID(), snapshot })
      const sent = creation?.snapshot ?? snapshot
      try {
        const saved = draft && !review && !saveUnconfirmed && matches(draft, snapshot) ? draft : await composeDraftAction({
          action: 'save', id: draft?.id ?? null, revision: draft?.revision ?? null,
          ...sent, ...(creation && { clientId: creation.clientId }),
        })
        if (window.location.href !== openedAt) return
        first.current = null
        if (!matches(saved, sent)) {
          setConflict(saved)
          return
        }
        setDraft(saved)
        setSaveFailed(false)
        setSaveUnconfirmed(false)
        if (!draftId) {
          ownNavigation.current = saved.id
          window.history.replaceState(null, '', fileDraftHref(saved.id))
        }
        // A retry can resolve an earlier create while newer text is still in the editor.
        if (review && matches(saved, snapshot)) setPreview(saved)
      } catch (reason) {
        if (window.location.href !== openedAt) return
        setSaveFailed(true)
        setSaveUnconfirmed(!(reason instanceof ReplyError) || reason.status >= 500 || reason.status === 409 || saveUnconfirmed)
        if (creation && reason instanceof ReplyError && [400, 413, 422].includes(reason.status)) first.current = null
        if (draft && reason instanceof ReplyError && reason.status === 409) {
          const latest = await composeRequest<FileComposeDraft>('/api/compose-drafts?id=' + encodeURIComponent(draft.id), {
            signal: AbortSignal.timeout(8_000),
          }).catch(() => null)
          if (window.location.href !== openedAt) return
          if (latest) {
            if (matches(latest, snapshot)) {
              setDraft(latest)
              setSaveFailed(false)
              setSaveUnconfirmed(false)
              if (review) setPreview(latest)
            } else setConflict(latest)
            return
          }
        }
        throw new ReplyError(reason instanceof ReplyError ? reason.message : 'Chưa nhận được xác nhận lưu. Nội dung vẫn ở đây. Hãy thử lưu lại.', 400)
      }
    }, automatic)
  }

  function chooseConflict(keepLocal: boolean) {
    if (!conflict || (keepLocal && conflict.state !== 'draft')) return
    if (!keepLocal) {
      apply.current(conflict.fields, conflict.accountId)
      setFiles(conflict.files)
    }
    setDraft(conflict)
    setConflict(null)
    setError(null)
    setSaveFailed(false)
    setSaveUnconfirmed(false)
    if (!draftId) {
      ownNavigation.current = conflict.id
      window.history.replaceState(null, '', fileDraftHref(conflict.id))
    }
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
    blocked, error, permission, reopen, save, approve, change, initial, conflict, chooseConflict, saveFailed, saveUnconfirmed, autoSaving,
    send: (action: 'send' | 'check') => draft && run(() => submit(action, draft)) }
}
