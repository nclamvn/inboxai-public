import { z } from 'zod'

const scopeHash = z.string().regex(/^[0-9a-f]{64}$/)
export const operatorPlanInput = z.strictObject({
  command: z.string().trim().min(1).max(240).refine(command => !command.includes('\0')),
  accountId: z.uuid().nullable().default(null),
})
export const operatorActionInput = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('approve'), previewHash: scopeHash, selectedIds: z.array(z.uuid()).min(1).max(40) }),
  z.strictObject({ operation: z.literal('execute'), approvedHash: scopeHash }),
  z.strictObject({ operation: z.literal('verify') }),
  z.strictObject({ operation: z.literal('undo'), undoHash: scopeHash }),
])
