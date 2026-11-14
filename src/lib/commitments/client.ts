import type { DetectionCommand, DetectionPage } from './detection'
import type { BoardPage, CommitmentGroup, LedgerDetail } from './view'
import type { CommitmentEvidence, CommitmentState, ReceivingCommand } from './contracts'
import type { CatchupAttention } from './catchup'
import type { ReminderCommand, ReminderPreview, ReminderResult } from './attention'

export class LedgerApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

async function ledgerRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`/api/commitments${path}`, { ...init, cache: 'no-store' })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new LedgerApiError(response.status, typeof error?.error === 'string' ? error.error : 'Chưa thể truy cập sổ cam kết.')
  }
  return response.json() as Promise<T>
}

export function loadCommitmentBoard(group: CommitmentGroup, before: string | null, signal: AbortSignal) {
  const params = new URLSearchParams({ group })
  if (before) params.set('beforeId', before)
  return ledgerRequest<BoardPage>(`?${params}`, { signal })
}

export function loadCommitmentDetail(id: string, before: number | null, signal: AbortSignal) {
  const cursor = before === null ? '' : `?beforeVersion=${before}`
  return ledgerRequest<LedgerDetail>(`/${id}${cursor}`, { signal })
}

export type CommitmentConfirmation = {
  expectedVersion: number
  state: CommitmentState
  evidence: CommitmentEvidence[]
}

export function confirmCommitment(id: string, key: string, draft: CommitmentConfirmation) {
  return ledgerRequest<{ id: string; version: number; replayed: boolean }>(`/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ operation: 'revise', ...draft }),
    signal: AbortSignal.timeout(15_000),
  })
}

export function loadCommitmentDetections(before: string | null, signal: AbortSignal) {
  const params = before ? '?' + new URLSearchParams({ beforeId: before }) : ''
  return ledgerRequest<DetectionPage>('/detections' + params, { signal })
}

export function confirmCommitmentDetection(key: string, command: DetectionCommand) {
  return ledgerRequest<{ id: string; version: number; replayed: boolean }>('/detections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(20_000),
  })
}

export function loadCommitmentAttention(accounts: string[], signal: AbortSignal) {
  const params = new URLSearchParams()
  for (const id of accounts) params.append('account', id)
  return ledgerRequest<CatchupAttention>('/attention?' + params, { signal })
}

export function loadCommitmentReminder(id: string, signal: AbortSignal) {
  return ledgerRequest<ReminderPreview>('/' + id + '/reminder', { signal })
}

export function approveCommitmentReminder(id: string, command: ReminderCommand) {
  return ledgerRequest<ReminderResult>('/' + id + '/reminder', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
    signal: AbortSignal.timeout(45_000),
  })
}

export function loadCommitmentCatchup(accounts: string[], source: string | null, before: string | null, signal: AbortSignal) {
  const params = new URLSearchParams()
  for (const account of accounts) params.append('account', account)
  if (source) params.set('source', source)
  if (before) params.set('beforeId', before)
  return ledgerRequest<DetectionPage>('/catchup?' + params, { signal })
}

export function dismissCommitmentCatchup(emailId: string, token: string, hash: string) {
  return ledgerRequest<{ dismissed: boolean }>('/catchup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailId, token, hash }), signal: AbortSignal.timeout(15_000),
  })
}

export function confirmCommitmentReceiving(id: string, key: string, command: ReceivingCommand) {
  return ledgerRequest<{ id: string; version: number; replayed: boolean }>(`/${id}/receiving`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(20_000),
  })
}

export function confirmPurchaseOrder(key: string, command: import('./purchase-order').PurchaseCommand) {
  return ledgerRequest<{ id: string; version: number; replayed: boolean }>('/purchase', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(command), signal: AbortSignal.timeout(20_000),
  })
}
