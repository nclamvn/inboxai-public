import { z } from 'zod'

const boundedText = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes('\0'))
const evidence = z.array(z.strictObject({
  emailId: z.uuid(),
  field: z.enum(['subject', 'body_text']),
  quote: z.string().min(1).max(480).refine(value => value.trim().length > 0 && !value.includes('\0')),
})).min(1).max(3)

const delivery = z.strictObject({
  ordered: z.number().int().min(1).max(9_999_999),
  delivered: z.number().int().min(0).max(9_999_999),
  unit: z.enum(['bộ', 'chiếc', 'kiện', 'cuộn', 'hộp', 'cái']),
})

export const warehouseSender = z.string().trim().toLowerCase().max(254).pipe(z.email())

const receiving = z.strictObject({
  accountId: z.uuid(),
  sender: warehouseSender,
  received: z.number().int().min(0).max(9_999_999),
})

const state = z.strictObject({
  title: boundedText(200),
  ownerName: boundedText(120).nullable(),
  ownerEmail: z.string().trim().max(254).pipe(z.email()).nullable(),
  dueOn: z.iso.date().nullable(),
  dueAt: z.iso.datetime({ offset: true }).regex(/T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/).nullable(),
  status: z.enum(['open', 'completed', 'cancelled']),
  delivery: delivery.optional(),
  receiving: receiving.optional(),
}).refine(value => value.dueOn === null || value.dueAt === null)
  .refine(({ delivery, receiving, status }) => {
    if (!delivery) return !receiving
    if (delivery.delivered > delivery.ordered || (receiving && receiving.received > delivery.ordered)) return false
    if (status === 'completed') return delivery.delivered === delivery.ordered && (!receiving || receiving.received === delivery.ordered)
    return !!receiving || status === 'cancelled' || delivery.delivered < delivery.ordered
  })

export type CommitmentState = z.infer<typeof state>
export type CommitmentEvidence = z.infer<typeof evidence>[number]

const version = z.number().int().min(1).max(2_147_483_647)
const review = z.strictObject({ kind: z.enum(['ambiguous', 'conflicting']), note: boundedText(500) })

export const commitmentId = z.uuid()
export const requestKey = z.uuidv4()
export const createCommitment = z.strictObject({
  referenceKey: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._:-]{0,119}$/),
  state,
  evidence,
})
export const reviseCommitment = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('revise'), expectedVersion: version, state, evidence }),
  z.strictObject({ operation: z.literal('flag_review'), expectedVersion: version, review, evidence }),
])
const positiveInteger = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number)
export const pageLimit = positiveInteger.pipe(z.number().int().min(1).max(50))
export const historyCursor = positiveInteger.pipe(version)

export const commitmentReceipt = z.strictObject({
  id: commitmentId,
  version,
  replayed: z.boolean(),
})

const receivingVersion = { expectedVersion: version }
export const receivingCommand = z.discriminatedUnion('operation', [
  z.strictObject({ ...receivingVersion, operation: z.literal('configure'), accountId: z.uuid(), sender: warehouseSender }),
  z.strictObject({ ...receivingVersion, operation: z.literal('receive'), emailId: z.uuid(),
    sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/), quote: evidence.element.shape.quote }),
  z.strictObject({ ...receivingVersion, operation: z.literal('close') }),
])
export type ReceivingCommand = z.infer<typeof receivingCommand>
