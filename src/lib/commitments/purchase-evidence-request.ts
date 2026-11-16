import { z } from 'zod'

export const evidenceRequestInput = z.strictObject({ caseId: z.uuid() })
export const evidenceRequestContext = z.object({
  caseId: z.uuid(), stage: z.enum(['buyer','reviewer','closed']), canRequest: z.boolean(),
  request: z.object({
    draftId: z.uuid(), sourceId: z.uuid(), sentId: z.uuid().nullable(),
    state: z.enum(['draft','prepared','dispatching','unknown','accepted','partial','rejected']),
    replyId: z.uuid().nullable(), followupOn: z.iso.date().nullable(), tracking: z.boolean(),
    active: z.boolean(), canContinue: z.boolean(),
    work: z.object({
      id: z.uuid(), sourceId: z.uuid(), subject: z.string(), account: z.string(),
      status: z.enum(['reply','due','waiting','draft','sending','sent']),
      replyId: z.uuid().nullable(), quote: z.string().nullable(), followupOn: z.iso.date().nullable(),
      followupKey: z.uuid().nullable(), reminderState: z.enum(['dispatching','unknown','accepted','partial','rejected']).nullable(),
    }),
  }).nullable(),
})

export type EvidenceRequestContext = z.infer<typeof evidenceRequestContext>
