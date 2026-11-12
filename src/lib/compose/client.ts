import { ReplyError } from '@/lib/replies/client'
import type { FileComposeDraft } from './contracts'

export async function composeRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { signal: AbortSignal.timeout(55_000), cache: 'no-store', ...init })
  const result = await response.json()
  if (!response.ok) throw new ReplyError(result.error ?? 'Chưa thể hoàn tất thao tác.', response.status, result.code)
  return result as T
}

export const composeDraftAction = <T = FileComposeDraft>(command: object) => composeRequest<T>('/api/compose-drafts', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
})

export const fileDraftHref = (draft: string) => '/compose?draft=' + encodeURIComponent(draft)
