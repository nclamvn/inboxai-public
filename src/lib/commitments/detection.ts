import type { CommitmentEvidence, CommitmentState, ReceivingCommand } from './contracts'
import type { DetectionSignal } from './detect'
import type { LedgerState } from './view'

export type DetectionCommand = {
  sourceFingerprint: string
  referenceKey: string
  evidence: CommitmentEvidence
  state: CommitmentState
} & (
  { operation: 'create' } |
  { operation: 'revise'; id: string; expectedVersion: number }
)

export type ReceivingProposalCommand = Extract<ReceivingCommand, { operation: 'receive' }> & { id: string; state: CommitmentState }

export type CommitmentProposal = {
  proposalId: string
  catchupToken?: string
  emailId: string
  accountId: string | null
  commitmentId: string | null
  subject: string | null
  sender: string
  at: string | null
  quote: string
  kind: DetectionSignal['kind']
  reference: string | null
  proposedDueOn?: string | null
  proposedBatch?: DetectionSignal['proposedBatch'] | null
  previous: LedgerState | null
  review: { command: DetectionCommand | ReceivingProposalCommand; title: string } | null
  blocked: 'unmatched' | 'chronology' | 'ambiguous' | 'conflicting' | 'uncertain' | 'quantity' | 'warehouse' | 'duplicate_receipt' | null
}

export type DetectionPage = { proposals: CommitmentProposal[]; nextBeforeId: string | null }
