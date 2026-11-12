import { z } from 'zod'

export const flags = z.enum(['archived', 'read', 'starred'])
export type TriageFlag = z.infer<typeof flags>
export const triageBatchLimit = 50
export const triageCommand = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('apply'), id: z.uuid(), flag: flags, desired: z.boolean(),
    emailIds: z.array(z.uuid()).min(1).max(triageBatchLimit) }),
  z.strictObject({ action: z.literal('check'), id: z.uuid() }),
  z.strictObject({ action: z.literal('undo'), id: z.uuid() }),
])
export type TriageCommand = z.infer<typeof triageCommand>
export type TriageItem = {
  emailId: string
  subject: string
  account: string
  state: 'pending' | 'verified' | 'conflict' | 'blocked' | 'gone'
  result: 'applied' | 'reconciled' | 'unchanged' | null
  canUndo: boolean
}
export type TriageJob = {
  id: string
  flag: TriageFlag
  desired: boolean
  undoOf: string | null
  hasUndo: boolean
  items: TriageItem[]
}
