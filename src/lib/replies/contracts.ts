import type { ComposeFile } from '@/lib/compose/contracts'

export type ReplyDraft = {
  id: string
  sourceId: string
  revision: number
  subject: string
  to: string
  cc: string
  body: string
  state: 'draft' | 'prepared' | 'dispatching' | 'unknown' | 'accepted' | 'partial' | 'rejected'
  tracking: boolean
  files: ComposeFile[]
  sentId: string | null
}

export type ReplyFields = Pick<ReplyDraft, 'to' | 'cc' | 'body'>

export type ReplyWorkbench = {
  accountId: string
  account: string
  fingerprint: string
  sourceId: string
  subject: string | null
  to: string
  draft: ReplyDraft | null
  stale: boolean
  thread: { id: string; sender: string; subject: string | null; at: string | null; snippet: string | null; source: boolean }[]
}

export type ReplyWork = {
  id: string
  sourceId: string
  subject: string
  account: string
  status: 'reply' | 'due' | 'waiting' | 'draft' | 'sending' | 'sent'
  replyId: string | null
  quote: string | null
  followupOn: string | null
  followupKey: string | null
  reminderState: 'dispatching' | 'unknown' | 'accepted' | 'partial' | 'rejected' | null
}

export type ReplyFollowupPreview = {
  key: string
  proof: string
  sourceId: string
  from: { address: string }
  to: string[]
  cc: string[]
  subject: string
  text: string
}

export const replyHref = (source: string) => '/compose?reply=' + encodeURIComponent(source)
