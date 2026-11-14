import { z } from 'zod'

export const purchaseUnit = z.enum(['bộ', 'chiếc', 'kiện', 'cuộn', 'hộp', 'cái'])
const quantity = z.number().int().min(0).max(9_999_999)
const lineCode = z.string().regex(/^[A-Z0-9]{1,12}$/)
const purchaseLine = z.strictObject({
  code: lineCode, ordered: quantity.min(1), reported: quantity, received: quantity, unit: purchaseUnit,
})
export const purchaseOrder = z.strictObject({
  reference: z.string().regex(/^PO-[0-9]{1,12}$/),
  lines: z.array(purchaseLine).min(2).max(6),
  warehouse: z.strictObject({ accountId: z.uuid(), sender: z.email() }).nullable(),
}).refine(({ lines }) => new Set(lines.map(line => line.code)).size === lines.length &&
  lines.every(line => line.reported <= line.ordered))
export type PurchaseOrder = z.infer<typeof purchaseOrder>
export type PurchaseLine = z.infer<typeof purchaseLine>
export type PurchaseOperation = 'create' | 'ship' | 'receive' | 'correct'

const version = z.number().int().min(1).max(2_147_483_647)
const mail = { emailId: z.uuid(), quote: z.string().min(1).max(480), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }
export const purchaseCommand = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), ...mail }),
  ...(['ship','receive','correct'] as const).map(operation => z.strictObject({ operation: z.literal(operation), ...mail,
    id: z.uuid(), version })),
  z.strictObject({ operation: z.literal('configure'), id: z.uuid(), version, accountId: z.uuid(),
    sender: z.string().trim().toLowerCase().max(254).pipe(z.email()) }),
  z.strictObject({ operation: z.literal('close'), id: z.uuid(), version }),
])
export type PurchaseCommand = z.infer<typeof purchaseCommand>
export type PurchaseMailCommand = Extract<PurchaseCommand, { operation: PurchaseOperation }>

// SQL checks the full source line, quantities and bindings when preparing and approving.
export function purchaseMailKind(quote: string): PurchaseOperation | null {
  if (/^đơn mua hàng nhiều dòng(?=[ ,:]|$)/iu.test(quote)) return 'create'
  if (/^báo giao dòng /iu.test(quote)) return 'ship'
  if (/^phiếu nhập PN-[0-9]{1,12} dòng /iu.test(quote)) return 'receive'
  if (/^đính chính DC-[0-9]{1,12} cho PN-[0-9]{1,12} dòng /iu.test(quote)) return 'correct'
  return null
}

export function allPurchaseLinesMatch(order: PurchaseOrder) {
  return order.lines.every(line => line.ordered === line.reported && line.ordered === line.received)
}
