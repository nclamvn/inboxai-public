import type { CommitmentEvidence, CommitmentState } from './contracts'
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
  previous: LedgerState | null
  review: { command: DetectionCommand; title: string } | null
  blocked: 'unmatched' | 'chronology' | 'ambiguous' | 'conflicting' | 'uncertain' | null
}

export type DetectionPage = { proposals: CommitmentProposal[]; nextBeforeId: string | null }
