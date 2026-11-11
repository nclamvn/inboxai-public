import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createCommitment, reviseCommitment } from './contracts'
import { detectCommitment, proposedState, senderIdentity, subjectReference, type DetectionSignal } from './detect'
import type { LedgerState } from './view'
import type { CommitmentProposal, DetectionCommand, DetectionPage } from './detection'

type Source = {
  id: string; accountId: string | null; sender: string; senderName: string | null
  subject: string | null; body: string | null; at: string | null; fingerprint: string; used: boolean
}
type Signal = {
  source: Source; sender: string; signal: DetectionSignal; reference: string | null; key: string
}
type Target = { referenceKey: string; id: string; version: number; state: LedgerState; lastSourceAt: string | null }

export type ScanPage = { messages: Source[]; nextBeforeId: string | null }

const referenceKey = z.string().regex(/^mail:[0-9a-f]{64}$/)
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/)
const revise = reviseCommitment.options[0]
const detectionEvidence = createCommitment.shape.evidence.element.extend({ field: z.literal('body_text') })
const shared = { sourceFingerprint: fingerprint, referenceKey, evidence: detectionEvidence, state: createCommitment.shape.state }
export const confirmDetection = z.discriminatedUnion('operation', [
  z.strictObject({ ...shared, operation: z.literal('create') }),
  z.strictObject({ ...shared, operation: z.literal('revise'), id: z.uuid(), expectedVersion: revise.shape.expectedVersion }),
])

export function interpretScan(page: ScanPage): Signal[] {
  return page.messages.flatMap(source => {
    if (source.used) return []
    const sender = senderIdentity(source.sender)
    const signal = detectCommitment(source.body)
    if (!sender || !signal) return []
    const reference = subjectReference(source.subject)
    const identity = reference ? [source.accountId, sender, reference] : [source.id]
    const key = 'mail:' + createHash('sha256').update(JSON.stringify(identity)).digest('hex')
    return [{ source, sender, signal, reference, key }]
  })
}

export function buildProposals(page: ScanPage, signals: Signal[], targets: Target[]): DetectionPage {
  const byReference = new Map(targets.map(target => [target.referenceKey, target]))
  const proposals = signals.flatMap((item): CommitmentProposal[] => {
    const { source, sender, signal, reference, key } = item
    const current = byReference.get(key)
    const at = source.at && Number.isFinite(Date.parse(source.at)) ? source.at : null
    const common = {
      emailId: source.id, subject: source.subject, sender, at, quote: signal.quote,
      kind: signal.kind, reference, previous: current?.state ?? null,
    }
    if (signal.kind !== 'create' && !current) return [{ ...common, review: null, blocked: 'unmatched' }]
    const state = proposedState(signal, sender, source.senderName, common.previous)
    if (!state) return []
    if (current && !(at && current.lastSourceAt && Date.parse(at) > Date.parse(current.lastSourceAt))) {
      return [{ ...common, review: null, blocked: 'chronology' }]
    }

    const command: DetectionCommand = {
      sourceFingerprint: source.fingerprint, referenceKey: key, state,
      evidence: { emailId: source.id, field: 'body_text', quote: signal.quote },
      ...(current
        ? { operation: 'revise' as const, id: current.id, expectedVersion: current.version }
        : { operation: 'create' as const }),
    }
    return [{ ...common, review: { command, title: state.title }, blocked: null }]
  })
  return { proposals, nextBeforeId: page.nextBeforeId }
}
