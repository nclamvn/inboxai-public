'use client'

import { useEffect, useRef, useState } from 'react'
import { useOfflineWorkspace } from './offline-provider'
import { hasOfflineDraft, type OfflineVault } from '../../../public/offline-workspace/storage.mjs'
import { compareOfflineReply, offlineReplyFor, sameReply, type OfflineReply } from '@/lib/offline/contracts'
import type { ReplyDraft, ReplyFields, ReplyWorkbench } from '@/lib/replies/contracts'

type Scan = { epoch: string; vault: OfflineVault | null; exists: boolean; pending: OfflineReply | null }

export function useOfflineReply(
  source: string, context: ReplyWorkbench | null, draft: ReplyDraft | null, fields: ReplyFields, saved: ReplyFields,
  setFields: (fields: ReplyFields) => void,
) {
  const offline = useOfflineWorkspace()
  const vault = offline?.vault ?? null
  const owner = offline?.owner
  const epoch = offline?.scope?.epoch
  const enrolled = Boolean(offline?.scope?.enrolled)
  const [scan, setScan] = useState<Scan | null>(null)
  const [copy, setCopy] = useState<{ epoch: string; fields: ReplyFields } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const queued = useRef<{ vault: OfflineVault; fields: ReplyFields; dirty: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    if (owner && epoch && enrolled) {
      const read = vault
        ? vault.get<OfflineReply>('draft', source).then(pending => ({ pending, exists: Boolean(pending) }))
        : hasOfflineDraft(owner, source).then(exists => ({ pending: null, exists }))
      void read.then(state => {
        if (alive) setScan({ epoch, vault, ...state })
      }).catch(() => {
        if (alive) setError('Chưa kiểm tra được bản nháp trên thiết bị.')
      })
    }
    return () => { alive = false }
  }, [source, owner, epoch, enrolled, vault])

  const inspected = !!scan && scan.epoch === epoch && scan.vault === vault
  const pending = inspected ? scan.pending : null
  const lockedDraft = enrolled && (!inspected || !!(scan?.exists && !vault))
  const effective = context && { ...context, draft }
  const comparison = pending && effective ? compareOfflineReply(pending, effective) : null

  useEffect(() => {
    if (!vault || !epoch || !context || !inspected || pending || busy || (draft && draft.state !== 'draft')) return
    const dirty = !sameReply(fields, saved)
    const previous = queued.current
    if (previous?.vault === vault && sameReply(previous.fields, fields) && previous.dirty === dirty) return
    if (!dirty && previous?.vault !== vault) return
    const operation = { vault, fields, dirty }
    queued.current = operation
    const write = dirty
      ? vault.put('draft', source, offlineReplyFor({ ...context, draft }, fields))
      : vault.remove('draft', source)
    void write.then(() => {
      if (queued.current !== operation) return
      setCopy(dirty ? { epoch, fields } : null)
      setError('')
    }).catch(cause => {
      if (queued.current !== operation) return
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được bản nháp trên thiết bị.')
    })
  }, [vault, epoch, source, context, draft, inspected, pending, fields, saved, busy])

  async function choose(choice: 'device' | 'server') {
    if (!vault || !epoch || !pending || !effective || busy) return false
    setBusy(true)
    setError('')
    try {
      const keepLocal = choice === 'device' && comparison !== 'saved'
      if (keepLocal) {
        if (comparison === 'blocked' || effective.stale) return false
        await vault.put('draft', source, offlineReplyFor(effective, pending.fields))
        queued.current = { vault, fields: pending.fields, dirty: !sameReply(pending.fields, saved) }
        setCopy({ epoch, fields: pending.fields })
        setFields(pending.fields)
      } else {
        await vault.remove('draft', source)
        queued.current = null
        setCopy(null)
        setFields(offlineReplyFor(effective, fields).base.fields)
      }
      setScan({ epoch, vault, pending: null, exists: keepLocal })
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được bản nháp.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    if (!vault || !epoch) return
    queued.current = null
    try {
      await vault.remove('draft', source)
      setCopy(null)
      setScan({ epoch, vault, pending: null, exists: false })
    } catch {
      setError('Đã cập nhật bản trên máy chủ. Chưa dọn được bản lưu trên thiết bị.')
    }
  }

  async function compareLatest(next: ReplyWorkbench) {
    if (!vault || !epoch) return false
    const local = await vault.get<OfflineReply>('draft', source).catch(() => null)
    if (local) {
      queued.current = null
      setScan({ epoch, vault, pending: local, exists: true })
      setFields(offlineReplyFor(next, local.fields).base.fields)
    }
    return Boolean(local)
  }

  return {
    pending, comparison, lockedDraft, busy, error, choose, clear, compareLatest,
    recover: offline?.requestVault,
    showUnlock: Boolean(offline?.scope && !vault),
    enrolled,
    savedLocally: Boolean(copy && copy.epoch === epoch && vault && sameReply(copy.fields, fields)),
  }
}
