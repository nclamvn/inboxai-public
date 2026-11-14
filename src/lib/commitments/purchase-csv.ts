import { z } from 'zod'
import type { PurchaseLine } from './purchase-order'
import type { SourceEvidence } from './view'

export const purchaseCsvSelection = z.strictObject({ emailId: z.uuid(), attachmentId: z.uuid() })
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const purchaseCsvApproval = purchaseCsvSelection.extend({
  id: z.uuid(), version: z.number().int().positive().max(2_147_483_647), digest, binding: digest,
})
export type PurchaseCsvApproval = z.infer<typeof purchaseCsvApproval>

export type CsvSourceReference = { id: string; proofId: string; filename: string; row: number }

export type PurchaseCsvRow = {
  row: number
  code: string
  quantity: number
  unit: PurchaseLine['unit']
}

export type PurchaseCsvPreview = {
  emailId: string
  attachmentId: string
  filename: string
  subject: string
  sender: string
  account: string
  document: string
  original: string | null
  reference: string
  rows: PurchaseCsvRow[]
  before: PurchaseLine[]
  after: PurchaseLine[]
  originals: SourceEvidence[]
  approval: PurchaseCsvApproval
}

export const purchaseCsvMaxSize = 8192

export function isPurchaseCsv(filename: string, contentType: string | null) {
  return /\.csv$/iu.test(filename) && ['text/csv', 'application/csv', 'application/octet-stream',
    'application/vnd.ms-excel', 'text/plain'].includes(contentType?.split(';')[0].trim().toLowerCase() ?? '')
}
