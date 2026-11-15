import { z } from 'zod'
import { dueExceptionStage } from './purchase-handoff'

const optionalId = z.uuid().nullable()
export const purchaseDuesPage = z.strictObject({
  items: z.array(z.strictObject({
    id: z.uuid(),
    role: z.enum(['owner', 'reviewer']),
    orderId: optionalId,
    invoiceId: optionalId,
    reference: z.string(),
    invoice: z.string(),
    status: z.enum(['waiting', 'partial', 'reopened', 'review']),
    deadline: z.iso.date().nullable(),
    remaining: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    invoiceEmailId: optionalId,
    invoiceAttachmentId: optionalId,
    returnEmailId: optionalId,
    canRequestEvidence: z.boolean(),
    exception: z.strictObject({ stage: dueExceptionStage.exclude(['closed']), reviewHandoff: optionalId }).nullable(),
  })).max(40),
  hasMore: z.boolean(),
})

export type PurchaseDue = z.infer<typeof purchaseDuesPage>['items'][number]

export function deadlineStatus(deadline: string, now: Date) {
  const day = new Date(now.getTime() + 7 * 60 * 60 * 1_000).toISOString().slice(0, 10)
  const days = (Date.parse(deadline) - Date.parse(day)) / 86_400_000
  if (days < 0) return 'Quá hạn'
  if (days === 0) return 'Đến hạn hôm nay'
  if (days <= 7) return 'Sắp đến hạn'
  return 'Chưa đến hạn'
}
