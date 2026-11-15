import { z } from 'zod'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const supplementSelection = z.object({ supplementId: z.uuid(), expectedDigest: digest })
export const supplementCases = z.array(z.uuid()).min(1).max(4).refine(ids => new Set(ids).size === ids.length)

const source = z.object({ emailId: z.uuid(), fileId: z.uuid(), filename: z.string(), subject: z.string() })
const match = source.extend({
  digest, invoice: z.string(), replaces: z.string(), deadline: z.iso.date().nullable(),
})
const check = source.extend({
  code: z.enum(['old','wrong_po','invalid','unlinked','missing_due','number_conflict']),
})
export const supplementScan = z.array(z.object({
  caseId: z.uuid(), incomplete: z.boolean(),
  matches: z.array(match).max(6), checks: z.array(check).max(6),
})).max(4)
export type SupplementScan = z.infer<typeof supplementScan>[number]
