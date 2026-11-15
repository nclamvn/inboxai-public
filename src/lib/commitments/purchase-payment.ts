import { z } from 'zod'
import { purchaseCsvApproval } from './purchase-csv'
import type { SourceEvidence } from './view'

const paymentApproval = z.strictObject({
  action: z.literal('approve'),
  invoiceId: z.uuid(),
  id: z.uuid(),
  proof: z.string().regex(/^[a-f0-9]{64}$/),
})
export const paymentCommand = z.discriminatedUnion('action', [
  purchaseCsvApproval.extend({ action: z.literal('register') }),
  paymentApproval,
])
export type PaymentCommand = z.infer<typeof paymentCommand>

export type PaymentSource = {
  emailId: string
  attachmentId: string
  filename: string
  subject: string
  sender: string
  account: string
  digest: string
}
export type PaymentDocumentLine = {
  row: number; code: string; quantity: number; unit: string; price: number; quote: string; paymentDue?: string
}
type PaymentDocument = {
  id: string
  kind: 'price' | 'invoice'
  number: string
  replaces: string | null
  lines: PaymentDocumentLine[]
  evidence: PaymentSource
}

export type PaymentPreview = Omit<PaymentDocument, 'id' | 'evidence'> & {
  reference: string
  source: PaymentSource
  command: Extract<PaymentCommand, { action: 'register' }>
}

export type PaymentLine = {
  code: string
  unit: string
  ordered: number
  received: number
  quantity: number
  expectedPrice: number
  invoicePrice: number
  invoiceRow: number
  priceRow: number
  otherApproved: number
  available: number
}

export type PaymentAttention = { id: string; invoiceId: string; reference: string; invoice: string; status: 'blocked' | 'ready' | 'missing_price' }
type InvoiceHistory = { id: string; installmentId: string; number: string; replaces: string | null; superseded: boolean; decisionAt: string | null }
type InvoiceAllocation = PaymentDocument & { invoiceId: string; installmentId: string; decisionId: string; decisionAt: string }
type PaymentBalance = { code: string; unit: string; approved: number; remaining: number; over: number }

export type PaymentSnapshot = {
  id?: string
  reference?: string
  handoffManaged?: boolean
  status: 'unavailable' | 'missing_price' | 'missing_invoice' | 'blocked' | 'ready' | 'approved' | 'superseded'
  price?: PaymentDocument | null
  invoice?: PaymentDocument | null
  sources?: (SourceEvidence & { line: string | null; operation: 'create' | 'receive' | 'correct' })[]
  lines?: PaymentLine[]
  balances?: PaymentBalance[]
  allocations?: InvoiceAllocation[]
  invoices?: InvoiceHistory[]
  subtotal?: number
  decisionId?: string | null
  decisionAt?: string | null
  command?: Extract<PaymentCommand, { action: 'approve' }> | null
}

export const paymentReceipt = z.strictObject({
  id: z.uuid(), documentId: z.uuid().optional(), decisionId: z.uuid().optional(), replayed: z.boolean(),
}).refine(result => Boolean(result.documentId) !== Boolean(result.decisionId))

const vnd = new Intl.NumberFormat('vi-VN')
export const formatVnd = (amount: number) => vnd.format(amount) + ' ₫'

export function paymentHref(id: string, invoice?: string) {
  const params = new URLSearchParams({ id })
  if (invoice) params.set('invoice', invoice)
  return '/commitments/payment?' + params
}
