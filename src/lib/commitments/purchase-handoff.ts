import { z } from 'zod'
import type { PaymentSnapshot, PaymentSource } from './purchase-payment'

const id = z.uuid()
export const handoffCommand = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('submit'), commitmentId: id, invoiceId: id,
    reviewer: z.string().trim().toLowerCase().max(254).pipe(z.email()), proof: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ action: z.literal('return'), handoffId: id, reason: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal('request_evidence'), handoffId: id, reason: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal('approve'), handoffId: id }),
])
export type HandoffCommand = z.infer<typeof handoffCommand>
export const handoffReceipt = z.strictObject({
  id, action: z.enum(['submit','return','approve','request_evidence']), decisionId: id.nullable(), replayed: z.boolean(),
})
export type HandoffReceipt = z.infer<typeof handoffReceipt>
export type HandoffEvent = {
  id: string
  handoffId: string
  action: 'submit' | 'return' | 'supersede' | 'approve'
  actor: string
  reviewer: string
  at: string
  reason: string | null
  invoice: string
  decisionId: string | null
}
export type HandoffStatus = 'pending' | 'stale' | 'returned' | 'superseded' | 'approved'
export type HandoffListItem = { id: string; reference: string; invoice: string; status: HandoffStatus; at: string }
export const dueExceptionStage = z.enum(['buyer','reviewer','closed'])
export const dueExceptionLabel: Record<z.infer<typeof dueExceptionStage>, string> = {
  buyer: 'Chờ Mua hàng bổ sung', reviewer: 'Chờ Kế toán duyệt lại', closed: 'Đã khép ngoại lệ',
}
export type DueException = {
  stage: z.infer<typeof dueExceptionStage>
  reviewer: string
  requiresDue: boolean
  responseHandoff: string | null
  latestInvoiceId: string | null
  originInvoice: string
  originDeadline: string | null
  originTotal: number
  events: { id: string; action: HandoffEvent['action'] | 'request_evidence'; actor: string; reason: string | null; invoice: string; at: string }[]
}
export type HandoffOwner = {
  managed: boolean; pending: { id: string; reviewer: string; at: string } | null; history: HandoffEvent[]; exception: DueException | null
}
type SharedSource = Pick<PaymentSource, 'attachmentId' | 'filename' | 'subject' | 'sender'>
type ShareDocument<T> = Omit<NonNullable<T>, 'evidence'> & { evidence: SharedSource }
export type SharedPaymentSnapshot = Pick<PaymentSnapshot,'lines'|'balances'|'subtotal'> & {
  price: ShareDocument<PaymentSnapshot['price']>
  invoice: ShareDocument<PaymentSnapshot['invoice']>
  allocations: ShareDocument<NonNullable<PaymentSnapshot['allocations']>[number]>[]
  sources: { subject: string; quote: string; line: string | null; operation: string; attachment?: { id: string; filename: string; row: number } }[]
}
export type HandoffDetail = Omit<HandoffListItem,'at'> & {
  snapshot: SharedPaymentSnapshot | null; history: HandoffEvent[]; exception: DueException | null; canRequestEvidence: boolean
}

export const handoffHref = (id?: string) => id ? '/commitments/handoffs?id=' + encodeURIComponent(id) : '/commitments/handoffs'
