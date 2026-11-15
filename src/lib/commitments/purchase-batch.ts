import { z } from 'zod'
import { commitmentId } from './contracts'

export const batchTargets = z.array(commitmentId).min(1).max(8)
  .refine(ids => new Set(ids).size === ids.length)

const proof = z.string().regex(/^[a-f0-9]{64}$/)
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const line = z.object({
  handoffId: commitmentId, reference: z.string(), invoice: z.string(),
  deadline: z.iso.date(), filename: z.string(), amount,
})
export const batchPreview = z.object({
  lines: z.array(line.extend({ proof })).min(1).max(8),
  approvers: z.array(z.object({ id: commitmentId, label: z.string() })),
})
const action = z.enum(['submit','approve','cancel'])
export const batchCommand = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('submit'), approverId: commitmentId,
    lines: z.array(z.strictObject({ handoffId: commitmentId, proof })).min(1).max(8)
      .refine(lines => batchTargets.safeParse(lines.map(item => item.handoffId)).success),
  }),
  z.strictObject({ action: z.literal('approve'), id: commitmentId }),
  z.strictObject({ action: z.literal('cancel'), id: commitmentId }),
])
export const batchReceipt = z.strictObject({ id: commitmentId, action, replayed: z.boolean() })

const batchCard = z.object({
  id: commitmentId, at: z.string(), preparer: z.string(), approver: z.string(),
  role: z.enum(['preparer','approver']), stage: z.enum(['pending','approved','closed','cancelled']),
  stale: z.boolean(), hasReturn: z.boolean(),
})
export const batchList = z.array(batchCard).max(50)
export const batchDetail = batchCard.extend({
  lines: z.array(line.extend({
    paid: amount, entries: z.array(z.object({
      id: commitmentId, reference: z.string(), date: z.iso.date(),
      kind: z.enum(['payment','return']), amount, emailId: commitmentId.nullable(),
    })),
  })).max(8),
  events: z.array(z.object({ id: commitmentId, actor: z.string(), action: z.enum(['submit','approve','cancel','close']), at: z.string() })),
})
export type BatchCard = z.infer<typeof batchCard>
export type BatchDetail = z.infer<typeof batchDetail>
export type BatchReceipt = z.infer<typeof batchReceipt>
export type BatchCommand = z.infer<typeof batchCommand>

export const batchHref = (id: string) => '/commitments/batches?id=' + encodeURIComponent(id)
