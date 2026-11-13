'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useOfflineWorkspace, offlineHome } from './offline-provider'
import type { ComposeFields, ComposeFile, FileComposeDraft } from '@/lib/compose/contracts'
import { localFile, sameDraftFields, validateDraftFiles, type DeviceCompose, type DeviceFile } from '../../../public/offline-workspace/compose.mjs'
import type { OfflineVault } from '../../../public/offline-workspace/storage.mjs'

type Checkpoint = { routeKey: string; id: string; version: string | null; vault: OfflineVault }
type Sender = { id: string; email_address: string }

export function useDeviceCompose(input: {
  routeKey: string
  draft: FileComposeDraft | null
  sourceId: string | null
  accounts: Sender[]
  accountId: string
  fields: ComposeFields
  serverFiles: ComposeFile[]
}) {
  const workspace = useOfflineWorkspace()
  const [session, setSession] = useState<Checkpoint | null>(null)
  const [files, setFiles] = useState<DeviceFile[]>([])
  const [saved, setSaved] = useState<DeviceCompose | null>(null)
  const [busy, setBusy] = useState(false)
  const [existing, setExisting] = useState<{ routeKey: string; id: string } | null>(null)
  const [error, setError] = useState('')
  const latest = useRef<Checkpoint | null>(null)
  const active = useRef(false)
  const selected = session?.routeKey === input.routeKey ? session : null
  const current = selected && workspace?.vault === selected.vault ? selected : null
  const locked = !!selected && !current
  const { draft, sourceId, accounts, accountId, fields, serverFiles } = input
  const available = !!workspace?.scope && accounts.some(account => account.id === accountId)
  const dirty = Boolean(current && (!saved || !sameDraftFields(fields, saved.fields) || accountId !== saved.accountId))
  const snapshot = JSON.stringify([accountId, fields])

  function value(next: DeviceFile[]): DeviceCompose {
    return { draftId: draft?.id ?? null, revision: draft?.revision ?? null, sourceId,
      accounts: accounts.map(account => ({ id: account.id, address: account.email_address })),
      accountId, fields, files: next, updatedAt: Date.now() }
  }

  async function write(checkpoint: Checkpoint, next: DeviceFile[], added?: { file: DeviceFile; bytes: Blob }[]) {
    if (active.current) return
    active.current = true
    setBusy(true)
    setError('')
    const nextValue = value(next)
    try {
      const version = await checkpoint.vault.saveCompose(checkpoint.id, checkpoint.version, nextValue, added)
      if (latest.current?.id !== checkpoint.id) return
      latest.current = { ...checkpoint, version }
      setFiles(next)
      setSaved(nextValue)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa lưu được bản nháp trên thiết bị.')
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  const writeCurrent = useEffectEvent(() => {
    if (latest.current && current) void write(latest.current, files)
  })
  useEffect(() => {
    if (!dirty || busy || error) return
    const timer = window.setTimeout(() => writeCurrent(), 250)
    return () => window.clearTimeout(timer)
  }, [dirty, busy, error, snapshot])

  async function enable() {
    if (!workspace || !available || busy || current) return
    setBusy(true)
    try {
      setError('')
      const vault = workspace.vault ?? await workspace.requestVault()
      if (!vault) return
      const previous = (draft || sourceId) && await vault.findCompose(draft?.id ?? null, sourceId)
      if (previous) {
        setError('Thiết bị đã có một bản nháp cho thư này. Mở bản đã lưu để tiếp tục.')
        setExisting({ routeKey: input.routeKey, id: previous })
        return
      }
      const added = []
      for (const metadata of serverFiles) {
        const response = await fetch('/api/compose-files?id=' + encodeURIComponent(metadata.id),
          { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error('Chưa sao lưu được tệp ' + metadata.filename + '.')
        const bytes = await response.blob()
        const hash = await crypto.subtle.digest('SHA-256', await bytes.arrayBuffer())
        if (bytes.size !== metadata.size || Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('') !== metadata.sha256) {
          throw new Error('Tệp tải xuống không khớp bản nháp.')
        }
        added.push({ file: { ...metadata, local: true as const }, bytes })
      }
      const checkpoint = { routeKey: input.routeKey, id: crypto.randomUUID(), version: null, vault }
      const manifest = added.map(entry => entry.file)
      const snapshot = value(manifest)
      await vault.put('profile', 'compose', { accounts: snapshot.accounts, accountId: snapshot.accountId })
      const version = await vault.saveCompose(checkpoint.id, null, snapshot, added)
      latest.current = { ...checkpoint, version }
      setSaved(snapshot)
      setSession(checkpoint)
      setFiles(manifest)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa mở được kho ngoại tuyến.')
    } finally {
      setBusy(false)
    }
  }

  async function attach(chosen: File[]) {
    if (!current || !latest.current || busy) return
    try {
      const added = chosen.map(bytes => ({ file: localFile(bytes), bytes }))
      const next = [...files, ...added.map(entry => entry.file)]
      validateDraftFiles(next)
      await write(latest.current, next, added)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa lưu được tệp trên thiết bị.')
    }
  }

  const key = current?.id ?? (existing?.routeKey === input.routeKey ? existing.id : null)
  return {
    enabled: !!current, locked, busy, error, dirty, files,
    available,
    saved: !!current && !!saved && !dirty && !busy,
    deviceHref: key ? offlineHome + '?' + new URLSearchParams({ compose: key }) : null,
    syncHref: key ? '/compose?' + new URLSearchParams({ offlineDraft: key }) : null,
    enable, attach,
    remove: (id: string) => {
      if (current && latest.current && !busy) void write(latest.current, files.filter(file => file.id !== id))
    },
    retry: () => { if (current && latest.current && !busy) void write(latest.current, files) },
  }
}
