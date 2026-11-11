import { z } from 'zod'

export const sendKey = z.uuidv4().transform(value => value.toLowerCase())
const mailbox = z.string().trim().max(254).pipe(z.email())
const recipients = z.union([mailbox, z.array(mailbox).min(1).max(50)])
  .transform(value => typeof value === 'string' ? [value] : value)
const optionalRecipients = z.array(mailbox).max(50).default([])
export const sendInput = z.object({
  sourceAccountId: z.uuid(),
  to: recipients,
  cc: optionalRecipients,
  bcc: optionalRecipients,
  subject: z.string().trim().min(1).max(500).regex(/^[^\r\n\x00]+$/),
  text: z.string().max(100_000).regex(/^[^\x00]*$/).default(''),
  html: z.string().max(200_000).regex(/^[^\x00]*$/).optional(),
  replyToEmailId: z.uuid().optional(),
}).strict().refine(input => input.to.length + input.cc.length + input.bcc.length <= 50)

export type SendInput = z.infer<typeof sendInput>
export type SendScope = { userId: string; accountId: string; key: string; hash: string }
export type MailPayload = {
  from: { name: string; address: string }
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  text: string
  html?: string
  inReplyTo?: string
}
export const receiptSchema = z.object({
  id: z.uuid(),
  provider: z.enum(['gmail', 'smtp']),
  state: z.enum(['dispatching', 'unknown', 'accepted', 'partial', 'rejected']),
  messageId: z.string(),
  providerId: z.string().nullable(),
  claimed: z.boolean(),
  reconcile: z.boolean(),
})
export type SendReceipt = z.infer<typeof receiptSchema>
export type SendOutcome =
  | { state: 'accepted' | 'partial'; providerId?: string }
  | { state: 'unknown' | 'rejected' }

export class SendError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
