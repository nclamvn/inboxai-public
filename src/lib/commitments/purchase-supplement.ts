import { z } from 'zod'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const supplementSelection = z.object({ supplementId: z.uuid(), expectedDigest: digest })
export const supplementCases = z.array(z.uuid()).min(1).max(4).refine(ids => new Set(ids).size === ids.length)
export const supplementReview = z.strictObject({ caseId: z.uuid(), invoiceId: z.uuid() })

const source = z.object({ emailId: z.uuid(), fileId: z.uuid(), filename: z.string(), subject: z.string() })
export const supplementMatch = source.extend({
  digest, invoice: z.string(), replaces: z.string(), deadline: z.iso.date().nullable(),
})
export const supplementCheck = source.extend({
  code: z.enum(['old','wrong_po','invalid','unlinked','missing_due','number_conflict']),
})
export const supplementScan = z.array(z.object({
  caseId: z.uuid(), incomplete: z.boolean(),
  matches: z.array(supplementMatch).max(6), checks: z.array(supplementCheck).max(6),
  progress: z.object({
    invoiceId: z.uuid(), total: z.number().int().nonnegative(), checked: z.number().int().nonnegative(),
    unavailable: z.boolean(),
  }).optional(),
})).max(4)
export type SupplementScan = z.infer<typeof supplementScan>[number]
