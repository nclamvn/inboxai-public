import { z } from 'zod'

export const composeFileLimit = 8 * 1024 * 1024
export const composeFileCount = 5
export const composeFileIds = z.array(z.uuid()).max(composeFileCount)
export const composeFile = z.object({
  id: z.uuid(), filename: z.string(), contentType: z.string(),
  sourceAttachmentId: z.uuid().optional(),
  size: z.number().int().positive().max(composeFileLimit), sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export type ComposeFile = z.infer<typeof composeFile>
export type SourceFile = { id: string; filename: string; size: number | null; is_inline: boolean }

export const composeFields = z.strictObject({
  to: z.string().max(4000), cc: z.string().max(4000), subject: z.string().max(500), body: z.string().max(100_000),
})
export type ComposeFields = z.infer<typeof composeFields>
export type FileComposeDraft = {
  id: string
  sourceId: string | null
  accountId: string
  revision: number
  fields: ComposeFields
  files: ComposeFile[]
  state: 'draft' | 'prepared' | 'dispatching' | 'unknown' | 'accepted' | 'partial' | 'rejected'
}
