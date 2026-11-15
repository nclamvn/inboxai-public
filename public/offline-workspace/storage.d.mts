import type { DeviceCompose, DeviceFile } from './compose.mjs'

export interface OfflineScope {
  owner: string
  epoch: string
  enrolled: boolean
}
export interface OfflineVault {
  owner: string
  epoch: string
  get<T>(kind: 'mail' | 'draft' | 'profile', source: string): Promise<T | null>
  put<T>(kind: 'mail' | 'draft' | 'profile', source: string, value: T): Promise<void>
  remove(kind: 'mail' | 'draft' | 'profile', source: string): Promise<void>
  findCompose(draftId: string | null, sourceId: string | null): Promise<string | null>
  getCompose(id: string): Promise<{ version: string; value: DeviceCompose } | null>
  saveCompose(id: string, expected: string | null, value: DeviceCompose, added?: { file: DeviceFile; bytes: Blob }[]): Promise<string>
  getComposeFile(id: string, fileId: string): Promise<ArrayBuffer>
  removeCompose(id: string, expected: string): Promise<void>
  list(): Promise<({ kind: 'mail' | 'draft' | 'profile'; source: string; value: unknown } |
    { kind: 'compose'; source: string; version: string; value: DeviceCompose })[]>
}
export function offlineScope(): Promise<OfflineScope | null>
export function selectOfflineOwner(owner: string): Promise<OfflineScope>
export function hasOfflineDraft(owner: string, source: string): Promise<boolean>
export function clearOfflineVault(owner?: string): Promise<void>
export function openOfflineVault(owner: string, passphrase: string, enroll?: boolean): Promise<OfflineVault>
export function watchOfflineScope(callback: () => void): () => void
