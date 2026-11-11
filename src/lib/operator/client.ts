import type { OperatorHistory, OperatorPlan, OperatorReceipt } from './contracts'

export class OperatorApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

async function operatorRequest<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch('/api/operator' + path, { ...options, cache: 'no-store' })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) {
    throw new OperatorApiError(response.status, typeof result?.error === 'string'
      ? result.error : 'Chưa nhận được kết quả. Hãy thử lại cùng yêu cầu.')
  }
  return result
}

export function loadOperatorHistory(signal: AbortSignal) {
  return operatorRequest<OperatorHistory>('', { signal })
}

export function loadOperatorPlan(id: string, signal: AbortSignal) {
  return operatorRequest<OperatorPlan>('/' + encodeURIComponent(id), { signal })
}

export function createOperatorPlan(command: string, accountId: string | null, key: string) {
  return operatorRequest<OperatorReceipt>('', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ command, accountId }), signal: AbortSignal.timeout(15_000),
  })
}

type OperatorCommand = { operation: 'approve'; previewHash: string; selectedIds: string[] } |
  { operation: 'execute'; approvedHash: string }

export function changeOperatorPlan(id: string, command: OperatorCommand) {
  return operatorRequest<OperatorReceipt>('/' + encodeURIComponent(id), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(15_000),
  })
}
