import type { SendReceipt } from '@/lib/mail-send/contracts'
import type { CommitmentGroup, LedgerState, Responsibility, SourceEvidence } from './view'

export type AttentionItem = {
  id: string
  version: number
  state: LedgerState
  group: CommitmentGroup
  responsibility: Responsibility
  reason: 'reply' | 'receiving' | 'receiving_ready' | 'review' | 'overdue' | 'today'
  source: SourceEvidence
  reminderState: SendReceipt['state'] | null
  reply: { emailId: string; subject: string | null; quote: string; needsReview: boolean; correction?: boolean } | null
}

export type ReminderPreview = {
  version: number
  accountId: string
  fromAddress: string
  fromName: string
  to: string
  subject: string
  text: string
  source: SourceEvidence
  proof: string
}

export type ReminderCommand = Pick<ReminderPreview, 'version' | 'accountId' | 'proof'>

export type ReminderResult = { state: SendReceipt['state']; operationId: string }
