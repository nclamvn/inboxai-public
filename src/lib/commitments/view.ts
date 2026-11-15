import { receivingValue } from './receiving'
import { deliveryLabel } from './delivery'
import type { CsvSourceReference } from './purchase-csv'
import type { CommitmentState, CommitmentEvidence } from './contracts'

export const groupLabels = {
  mine: 'Tôi phải làm',
  waiting: 'Đang chờ',
  overdue: 'Quá hạn',
  unassigned: 'Chưa rõ',
  closed: 'Đã khép',
} as const

export type CommitmentGroup = keyof typeof groupLabels
export type Responsibility = 'mine' | 'waiting' | 'unassigned'

export function isCommitmentGroup(value: string | null): value is CommitmentGroup {
  return value !== null && Object.hasOwn(groupLabels, value)
}

export type LedgerState = CommitmentState & { review: { kind: 'ambiguous' | 'conflicting'; note: string } | null }
export type BoardItem = {
  id: string
  referenceKey: string
  version: number
  createdAt: string
  updatedAt: string
  state: LedgerState
  responsibility: Responsibility
}
export type BoardPage = { items: BoardItem[]; totals: Record<CommitmentGroup, number>; nextBeforeId: string | null }
export type SourceEvidence = Omit<CommitmentEvidence, 'quote' | 'field'> & {
  field: CommitmentEvidence['field'] | 'attachment'
  attachment?: CsvSourceReference
  quote: string | null
  subject: string | null
  receivedAt: string | null
  href: string | null
  availability: 'available' | 'changed' | 'unavailable'
}
export type LedgerRevision = {
  version: number
  kind: 'created' | 'revised' | 'review_flagged'
  state: LedgerState
  changedFields: (keyof LedgerState)[]
  recordedAt: string
  sources: SourceEvidence[]
}
export type LedgerDetail = Omit<BoardItem, 'responsibility'> & { history: LedgerRevision[]; nextBeforeVersion: number | null }

export const statusLabels: Record<CommitmentState['status'], string> = {
  open: 'Đang mở',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
}

export const revisionLabels: Record<LedgerRevision['kind'], string> = {
  created: 'Tạo cam kết',
  revised: 'Xác nhận thay đổi',
  review_flagged: 'Ghi nhận cần xem xét',
}

export const fieldLabels: Record<keyof LedgerState, string> = {
  title: 'Nội dung',
  ownerName: 'Tên người phụ trách',
  ownerEmail: 'Email người phụ trách',
  dueOn: 'Ngày đến hạn',
  dueAt: 'Giờ đến hạn',
  status: 'Trạng thái',
  review: 'Xem xét',
  delivery: 'Tiến độ giao hàng',
  receiving: 'Kho thực nhận',
  purchaseOrder: 'Dòng hàng',
}

export function commitmentsHref(group: CommitmentGroup, id?: string) {
  const params = new URLSearchParams({ group })
  if (id) params.set('id', id)
  return `/commitments?${params}`
}

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'UTC' })
const timeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

export function formatCommitmentMoment(value: string) {
  return timeFormat.format(new Date(Date.parse(value) + 7 * 60 * 60_000))
}

export function formatCommitmentDue(state: Pick<CommitmentState, 'dueOn' | 'dueAt'>) {
  if (state.dueOn) return dateFormat.format(new Date(`${state.dueOn}T00:00:00Z`))
  if (state.dueAt) return formatCommitmentMoment(state.dueAt)
  return 'Chưa có hạn'
}

export function ownerLabel(state: Pick<CommitmentState, 'ownerName' | 'ownerEmail'>) {
  return state.ownerName || state.ownerEmail || 'Chưa rõ người phụ trách'
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validCommitmentId(value: string | null): value is string {
  return value !== null && uuid.test(value)
}

export function sourceEmailId(value: string, origin: string): string | null {
  const text = value.trim()
  if (validCommitmentId(text)) return text.toLowerCase()
  try {
    const url = new URL(text, origin)
    const id = url.searchParams.get('email')
    if (url.origin === origin && url.pathname === '/inbox' && validCommitmentId(id)) return id.toLowerCase()
  } catch {
    // The form accepts only an Inbox link or a message ID.
  }
  return null
}

export type DueKind = 'none' | 'date' | 'time'

export function localDeadline(dueAt: string) {
  return new Date(Date.parse(dueAt) + 7 * 60 * 60_000).toISOString().slice(0, 19)
}

export function draftDeadline(kind: DueKind, input: string, existing: CommitmentState) {
  if (kind === 'date') return { dueOn: input || null, dueAt: null }
  if (kind === 'time' && input) {
    const withSeconds = input.length === 16 ? `${input}:00` : input
    return {
      dueOn: null,
      dueAt: existing.dueAt && localDeadline(existing.dueAt) === withSeconds
        ? existing.dueAt
        : `${withSeconds}+07:00`,
    }
  }
  return { dueOn: null, dueAt: null }
}

export function commitmentChanges(before: LedgerState, after: CommitmentState) {
  const changes: { field: string; from: string; to: string }[] = []
  for (const field of ['title', 'ownerName', 'ownerEmail'] as const) {
    if (before[field] !== after[field]) changes.push({ field: fieldLabels[field], from: before[field] ?? 'Chưa rõ', to: after[field] ?? 'Chưa rõ' })
  }
  if (before.dueOn !== after.dueOn || before.dueAt !== after.dueAt) {
    changes.push({ field: 'Hạn chót', from: formatCommitmentDue(before), to: formatCommitmentDue(after) })
  }
  if (after.delivery && (!before.delivery || before.delivery.delivered !== after.delivery.delivered)) {
    changes.push({ field: fieldLabels.delivery, from: before.delivery ? deliveryLabel(before.delivery) : 'Chưa ghi nhận', to: deliveryLabel(after.delivery) })
  }
  if (after.receiving && before.receiving?.received !== after.receiving.received) {
    changes.push({ field: fieldLabels.receiving, from: receivingValue(before), to: receivingValue(after) })
  }
  if (before.status !== after.status) changes.push({ field: 'Trạng thái', from: statusLabels[before.status], to: statusLabels[after.status] })
  if (before.review) changes.push({
    field: 'Xem xét', from: before.review.kind === 'conflicting' ? 'Có nguồn mâu thuẫn' : 'Còn điểm chưa rõ', to: 'Đã xác nhận',
  })
  return changes
}
