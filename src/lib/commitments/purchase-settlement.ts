import { z } from 'zod'
import { commitmentId } from './contracts'
import { purchaseCsvSelection } from './purchase-csv'

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const settlementCommand = purchaseCsvSelection.extend({
  handoffId: commitmentId,
  decisionId: commitmentId,
  binding: fingerprint,
  digest: fingerprint,
  expectedPaid: money,
  batchId: commitmentId.optional(),
  reversalOf: commitmentId.optional(),
  expectedReturned: money.optional(),
}).strict().refine(value => (value.reversalOf === undefined) === (value.expectedReturned === undefined)
  && !(value.batchId && value.reversalOf))

export const settlementReceipt = z.strictObject({
  id: commitmentId,
  handoffId: commitmentId,
  paid: money,
  remaining: money,
  replayed: z.boolean(),
})

export type SettlementCommand = z.infer<typeof settlementCommand>
export type SettlementReceipt = z.infer<typeof settlementReceipt>
export type SettlementScope = { handoffId: string } | { orderId: string; invoiceId: string }
export type SettlementSummary = { status: 'unapproved' } | {
  status: 'waiting' | 'partial' | 'paid' | 'reopened' | 'review'
  reference: string
  invoice: string
  due: number
  paid: number
  remaining: number
  excess: number
  returned: number
  entries: {
    id: string
    kind: 'payment' | 'return'
    originalTransfer: string | null
    reference: string
    paidOn: string
    amount: number
    invoice: string
    reviewer: string
    filename: string
    emailId: string | null
  }[]
}
export type SettlementPreview = {
  handoffId: string
  reference: string
  invoice: string
  transfer: string
  paidOn: string
  amount: number
  kind: 'payment' | 'return'
  originalTransfer: string | null
  originalAmount: number | null
  alreadyReturned: number
  due: number
  paid: number
  remaining: number
  remainingAfter: number
  filename: string
  subject: string
  command: SettlementCommand
}
