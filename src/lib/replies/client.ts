import type { ReplyWorkbench, ReplyWork } from './contracts'

export class ReplyError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}

export async function replyRequest<T>(action: object) {
  const response = await fetch('/api/replies', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action),
    signal: AbortSignal.timeout(55_000), cache: 'no-store',
  })
  const result = await response.json()
  if (!response.ok) throw new ReplyError(result.error ?? 'Chưa thể lưu thay đổi.', response.status, result.code)
  return result as T
}

async function read<T>(params: URLSearchParams, signal?: AbortSignal) {
  const response = await fetch('/api/replies?' + params, { signal, cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new ReplyError(result.error ?? 'Chưa thể mở phản hồi.', response.status)
  return result as T
}
export const readReply = (source: string, signal?: AbortSignal) =>
  read<ReplyWorkbench>(new URLSearchParams({ source }), signal)
export const readReplyWork = (accounts: string[], signal?: AbortSignal) => {
  const params = new URLSearchParams()
  for (const account of accounts) params.append('account', account)
  return read<ReplyWork[]>(params, signal)
}

// Suggestions travel only within the current navigation. An explicit choice in
// Compose applies the text to the server-backed draft.
let suggestion: { source: string; body: string } | null = null
export function offerReplyText(source: string, body: string) { suggestion = body ? { source, body } : null }
export function takeReplyText(source: string) {
  const result = suggestion?.source === source ? suggestion.body : null
  suggestion = null
  return result
}
