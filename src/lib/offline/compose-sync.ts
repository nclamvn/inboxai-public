import { composeDraftAction, composeRequest } from '@/lib/compose/client'
import { composeAddresses, sameComposeFields, type ComposeFile, type FileComposeDraft } from '@/lib/compose/contracts'
import type { DeviceCommand, DeviceCompose } from '../../../public/offline-workspace/compose.mjs'
import type { OfflineVault } from '../../../public/offline-workspace/storage.mjs'
import { ReplyError } from '@/lib/replies/client'

type Record = { version: string; value: DeviceCompose }
export type ComposeSyncResult =
  | { kind: 'saved'; draft: FileComposeDraft }
  | { kind: 'conflict'; draft: FileComposeDraft }

const same = (draft: FileComposeDraft, command: DeviceCommand) =>
  draft.state === 'draft' && draft.sourceId === command.sourceId && draft.accountId === command.accountId &&
  sameComposeFields(draft.fields, command.fields) && draft.files.length === command.fileIds.length &&
  draft.files.every((file, index) => file.id === command.fileIds[index])

export async function syncDeviceCompose(vault: OfflineVault, key: string, record: Record, confirmed?: FileComposeDraft): Promise<ComposeSyncResult> {
  let { value, version } = record
  const headers = { 'X-Draft-Owner': vault.owner }
  const read = (id: string) => composeRequest<FileComposeDraft>('/api/compose-drafts?id=' + encodeURIComponent(id), { headers })
  const command = (): DeviceCommand => ({
    id: value.draftId, revision: value.revision, accountId: value.accountId, sourceId: value.sourceId,
    fields: { ...value.fields, to: composeAddresses(value.fields.to).join(', '), cc: composeAddresses(value.fields.cc).join(', ') },
    fileIds: value.files.map(file => file.id),
  })
  let latest = value.draftId ? await read(value.draftId)
    : value.pending ? await composeRequest<FileComposeDraft | null>('/api/compose-drafts?creation=' + encodeURIComponent(key), { headers }) : null
  if (confirmed && (!latest || latest.id !== confirmed.id || latest.revision !== confirmed.revision || latest.state !== 'draft')) {
    if (latest) return { kind: 'conflict', draft: latest }
    throw new Error('Bản trên máy chủ đã thay đổi. Hãy đối chiếu lại.')
  }
  if (latest && (latest.state !== 'draft' || latest.sourceId !== value.sourceId)) return { kind: 'conflict', draft: latest }
  if (latest && same(latest, command())) {
    await vault.removeCompose(key, version)
    return { kind: 'saved', draft: latest }
  }
  if (latest && latest.revision !== value.revision && !confirmed &&
      !(value.pending && latest.revision === (value.pending.revision ?? 0) + 1 && same(latest, value.pending))) {
    return { kind: 'conflict', draft: latest }
  }

  // Reuse the IDs reserved on the device. A successful upload can be replayed
  // after a lost response without replacing another file or creating duplicates.
  const onServer = new Set(latest?.files.map(file => file.id))
  for (const file of value.files) {
    if (!file.local || file.sha256 || onServer.has(file.id)) continue
    const bytes = await vault.getComposeFile(key, file.id)
    const uploaded = await composeRequest<ComposeFile>('/api/compose-files', {
      method: 'POST', headers: { ...headers, 'X-Draft-File-Id': file.id, 'X-File-Name': encodeURIComponent(file.filename),
        'Content-Type': file.contentType }, body: bytes,
    })
    if (uploaded.id !== file.id || uploaded.size !== file.size) throw new Error('Máy chủ trả về tệp khác bản đã lưu.')
  }

  // Preserve the command before dispatch. Recover either a committed create or
  // the exact revision written by an update, even after restarting Chrome.
  if (latest) value = { ...value, draftId: latest.id, revision: latest.revision }
  const pending = command()
  version = await vault.saveCompose(key, version, { ...value, pending })
  let saved: FileComposeDraft
  try {
    saved = await composeDraftAction({ action: 'save', ...pending, ...(pending.id === null && { clientId: key }) }, vault.owner)
  } catch (reason) {
    if (pending.id && reason instanceof ReplyError && reason.status === 409) {
      latest = await read(pending.id)
      if (!same(latest, pending)) return { kind: 'conflict', draft: latest }
      saved = latest
    } else throw reason
  }
  if (!same(saved, pending)) return { kind: 'conflict', draft: saved }
  await vault.removeCompose(key, version)
  return { kind: 'saved', draft: saved }
}
