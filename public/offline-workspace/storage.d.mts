export interface OfflineScope {
  owner: string
  epoch: string
  enrolled: boolean
}
export interface OfflineVault {
  owner: string
  epoch: string
  get<T>(kind: 'mail' | 'draft', source: string): Promise<T | null>
  put<T>(kind: 'mail' | 'draft', source: string, value: T): Promise<void>
  remove(kind: 'mail' | 'draft', source: string): Promise<void>
  list(): Promise<{ kind: 'mail' | 'draft'; source: string; value: unknown }[]>
}
export function offlineScope(): Promise<OfflineScope | null>
export function selectOfflineOwner(owner: string): Promise<OfflineScope>
export function hasOfflineDraft(owner: string, source: string): Promise<boolean>
export function clearOfflineVault(owner?: string): Promise<void>
export function openOfflineVault(owner: string, passphrase: string, enroll?: boolean): Promise<OfflineVault>
export function watchOfflineScope(callback: () => void): () => void
