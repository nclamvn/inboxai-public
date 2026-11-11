import type { DetectionCommand, DetectionPage } from './detection'
import type { BoardPage, CommitmentGroup, LedgerDetail } from './view'
import type { CommitmentEvidence, CommitmentState } from './contracts'

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
