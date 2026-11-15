'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { offlineHome, useOfflineWorkspace } from '@/components/offline/offline-provider'
import { DraftVersion } from '@/components/email/draft-version'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { composeRequest, fileDraftHref } from '@/lib/compose/client'
import type { FileComposeDraft } from '@/lib/compose/contracts'
import { syncDeviceCompose } from '@/lib/offline/compose-sync'
import type { DeviceCompose } from '../../../public/offline-workspace/compose.mjs'

export function OfflineComposeRecovery({ deviceKey }: { deviceKey: string }) {
  const workspace = useOfflineWorkspace()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [comparison, setComparison] = useState<{ draft: FileComposeDraft; device: DeviceCompose; version: string } | null>(null)
  const [synced, setSynced] = useState<string | null>(null)
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceKey)

  async function synchronize(choice?: 'device' | 'server') {
    if (busy || !workspace || !valid) return
    setBusy(true)
    setError('')
    try {
      const vault = workspace.vault ?? await workspace.requestVault()
      if (!vault) return
      const record = await vault.getCompose(deviceKey)
      if (!record) throw new Error('Không tìm thấy bản nháp trên thiết bị.')
      if (choice && comparison && record.version !== comparison.version) {
        setComparison(null)
        throw new Error('Bản trên thiết bị đã thay đổi. Hãy kiểm tra lại cả hai bản.')
      }
      if (choice === 'server' && comparison) {
        // Recheck the server version before removing the local copy. A second
        // edit after the preview needs a new confirmation.
        const latest = await composeRequest<FileComposeDraft>('/api/compose-drafts?id=' + encodeURIComponent(comparison.draft.id),
          { headers: { 'X-Draft-Owner': vault.owner }, signal: AbortSignal.timeout(10_000) })
        if (latest.revision !== comparison.draft.revision || latest.state !== comparison.draft.state) {
          setComparison({ draft: latest, device: record.value, version: record.version })
          return
        }
        await vault.removeCompose(deviceKey, record.version)
        router.replace(fileDraftHref(latest.id))
        return
      }
      const result = await syncDeviceCompose(vault, deviceKey, record, choice === 'device' ? comparison?.draft : undefined)
      if (result.kind === 'conflict') {
        const current = await vault.getCompose(deviceKey)
        if (!current) throw new Error('Bản nháp trên thiết bị đã được xử lý ở cửa sổ khác.')
        setComparison({ draft: result.draft, device: current.value, version: current.version })
      }
      else {
        setComparison(null)
        setSynced(result.draft.id)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa đồng bộ được bản nháp. Hãy thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const activeComparison = workspace?.vault ? comparison : null
  const localHref = offlineHome + '?' + new URLSearchParams({ compose: deviceKey })
  return <section className="mx-auto min-h-full max-w-5xl space-y-4 bg-[var(--surface)] p-4 sm:p-6">
    <h1 className="neo-title">Đồng bộ bản nháp</h1>
    {error && <Alert variant="error" title="Chưa đồng bộ được bản nháp">{error}</Alert>}
    {!valid && <Alert variant="error">Đường dẫn bản nháp không hợp lệ.</Alert>}
    {valid && !activeComparison && !synced && <div className="flex flex-wrap items-center gap-3">
      <Button type="button" loading={busy} disabled={!workspace?.scope} onClick={() => void synchronize()}>Kiểm tra và đồng bộ</Button>
      <Link href={localHref} className="neo-target inline-flex items-center text-sm underline">Mở bản trên thiết bị</Link>
    </div>}
    {synced && <div className="space-y-2">
      <p role="status">Đã đồng bộ</p>
      <Link href={fileDraftHref(synced)} className="neo-target inline-flex items-center text-sm underline">Mở bản nháp đã đồng bộ</Link>
    </div>}
    {activeComparison && comparison && <section aria-labelledby="device-compose-conflict" className="space-y-3 border-s-2 border-[var(--accent-foreground)] ps-3">
      <h2 id="device-compose-conflict" className="font-semibold">Bản nháp đã thay đổi ở hai nơi</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <DraftVersion label="Bản trên thiết bị" fields={comparison.device.fields} files={comparison.device.files}
          account={comparison.device.accounts.find(account => account.id === comparison.device.accountId)?.address} />
        <DraftVersion label="Bản trên máy chủ" fields={comparison.draft.fields} files={comparison.draft.files}
          account={comparison.device.accounts.find(account => account.id === comparison.draft.accountId)?.address} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || comparison.draft.state !== 'draft' || comparison.device.sourceId !== comparison.draft.sourceId}
          onClick={() => void synchronize('device')}>Dùng bản trên thiết bị</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void synchronize('server')}>Dùng bản trên máy chủ</Button>
        <Link href={localHref} className="neo-target inline-flex items-center px-2 text-sm underline">Quay về bản trên thiết bị</Link>
      </div>
    </section>}
  </section>
}
