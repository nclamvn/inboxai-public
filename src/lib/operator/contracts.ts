export const operatorActions = {
  archive: 'Lưu trữ',
  mark_read: 'Đánh dấu đã đọc',
} as const

export type OperatorAction = keyof typeof operatorActions
export type OperatorStatus = 'planned' | 'approved' | 'executed' | 'stale' | 'expired'
export type OperatorSpec = {
  action: OperatorAction
  accountId: string | null
  olderThanDays: number | null
  beforeDate: string | null
  sender: string | null
  keepAttachments: boolean
}
export type OperatorReceipt = {
  id: string
  status: OperatorStatus
  replayed: boolean
  previewHash: string
  approvedHash: string | null
  approvedIds: string[] | null
  appliedCount: number | null
  expiresAt: string
}
export type OperatorTarget = {
  id: string
  subject: string | null
  sender: string | null
  account: string | null
  at: string | null
  hasAttachment: boolean | null
  available: boolean
  matchesPreview: boolean
}
export type OperatorOutcomeReceipt = {
  id: string
  event: 'verified' | 'undone' | 'undo_blocked'
  at: string
  matched: number
  changed: number
  unavailable: number
  replayed: boolean
}
export type OperatorOutcome = {
  tracked: boolean
  undone: boolean
  undoHash: string | null
  targets: { id: string; before: boolean | null; state: 'matched' | 'changed' | 'unavailable' }[]
  events: OperatorOutcomeReceipt[]
}
export type OperatorPlan = OperatorReceipt & {
  spec: OperatorSpec
  cutoff: string | null
  createdAt: string
  targets: OperatorTarget[]
  events: { event: OperatorStatus; count: number; at: string; scopeHash: string }[]
  outcome: OperatorOutcome | null
}
export type OperatorHistory = {
  id: string
  action: OperatorAction
  status: OperatorStatus
  targetCount: number
  createdAt: string
}[]

const date = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
})

export function operatorDate(at: string) {
  const instant = Date.parse(at)
  return Number.isFinite(instant) ? date.format(instant) : 'Chưa xác định'
}
