import { z } from 'zod'

export const purchaseFocus = z.array(z.object({
  id: z.uuid(),
  reference: z.string(),
  invoice: z.string(),
  task: z.enum(['supply', 'waiting', 'review', 'stale', 'resupply']),
  reason: z.string(),
  requestedBy: z.string(),
  reviewer: z.string(),
  openCount: z.number().int().positive(),
  orderId: z.uuid().nullable(),
  invoiceId: z.uuid().nullable(),
  emailId: z.uuid().nullable(),
  handoffId: z.uuid().nullable(),
  fileId: z.uuid().nullable(),
  filename: z.string().nullable(),
  deadline: z.iso.date().nullable(),
})).max(4)

export type PurchaseFocusItem = z.infer<typeof purchaseFocus>[number]
