import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createCommitment, reviseCommitment } from './contracts'
import { commitmentTitleKey, detectCommitments, proposedState, senderIdentity, subjectReference, type DetectionSignal } from './detect'
import type { LedgerState } from './view'
import type { CommitmentProposal, DetectionCommand, DetectionPage } from './detection'
import { ledgerRpc, type LedgerSession } from './http'

type Source = {
  id: string; accountId: string | null; sender: string; senderName: string | null
  subject: string | null; body: string | null; at: string | null; receivedAt: string | null
  fingerprint: string; usedQuotes: string[]; manualUsed: boolean
}
type Signal = {
  source: Source; sender: string; signal: DetectionSignal; reference: string | null; key: string; quoteHash: string
}
type Target = {
  reference: string; referenceKey: string; id: string; version: number; state: LedgerState; lastSourceAt: string | null
  originId: string; originTitle: string; originSender: string | null; originAccountId: string | null; multiOrigin: boolean
}

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

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

export function interpretScan(page: ScanPage): Signal[] {
  return page.messages.flatMap(source => {
    if (source.manualUsed) return []
    const sender = senderIdentity(source.sender)
    if (!sender) return []
    const reference = subjectReference(source.subject)
    const signals = detectCommitments(source.body, source.receivedAt)
    return signals.flatMap(signal => {
      const quoteHash = digest(signal.quote)
      if (source.usedQuotes.includes(quoteHash)) return []
      const identity = reference ? [source.accountId, sender, reference] : [source.id]
      if (signals.length > 1 && signal.title) identity.push(commitmentTitleKey(signal.title))
      const key = 'mail:' + digest(JSON.stringify(identity))
      return [{ source, sender, signal, reference, key, quoteHash }]
    })
  })
}

export function buildProposals(page: ScanPage, signals: Signal[], targets: Target[]): DetectionPage {
  const byReference = Map.groupBy(targets, target => target.reference)
  const proposals = signals.flatMap((item): CommitmentProposal[] => {
    const { source, sender, signal, reference, key, quoteHash } = item
    const related = (reference && byReference.get(reference)) || []
    const matching = related.filter(target => (
      target.originAccountId === source.accountId && target.originSender === sender
    ) || (
      target.state.ownerEmail?.toLowerCase() === sender &&
      (target.originAccountId === source.accountId || target.originSender !== sender)
    ))
    const open = matching.filter(target => target.state.status === 'open' && target.state.ownerEmail?.toLowerCase() === sender)
    const current = signal.kind !== 'create' && open.length === 1 ? open[0] : null
    const at = source.at && Number.isFinite(Date.parse(source.at)) ? source.at : null
    const common = {
      proposalId: source.id + ':' + quoteHash,
      emailId: source.id, accountId: source.accountId, commitmentId: current?.id ?? null,
      subject: source.subject, sender, at, quote: signal.quote,
      kind: signal.kind, reference, previous: current?.state ?? null,
    }
    if (related.length > 8 || (signal.kind !== 'create' && (open.length > 1 || current?.multiOrigin))) {
      return [{ ...common, review: null, blocked: 'ambiguous' }]
    }
    if (signal.kind === 'create') {
      const title = commitmentTitleKey(signal.title!)
      if (matching.some(target => target.referenceKey === key || commitmentTitleKey(target.originTitle) === title)) return []
      if (matching.some(target => target.originId !== source.id)) return [{ ...common, review: null, blocked: 'ambiguous' }]
    }
    if (signal.kind !== 'create' && !current) return [{ ...common, review: null, blocked: 'unmatched' }]
    if (current && !(source.receivedAt && current.lastSourceAt && Date.parse(source.receivedAt) > Date.parse(current.lastSourceAt))) {
      return [{ ...common, review: null, blocked: 'chronology' }]
    }
    if (signal.kind === 'review') return [{ ...common, review: null, blocked: 'uncertain' }]
    if (signal.priorDueOn && current?.state.dueOn !== signal.priorDueOn) {
      return [{ ...common, review: null, blocked: 'conflicting' }]
    }
    const state = proposedState(signal, sender, source.senderName, common.previous)
    if (!state) return []

    const command: DetectionCommand = {
      sourceFingerprint: source.fingerprint, referenceKey: current?.referenceKey ?? key, state,
      evidence: { emailId: source.id, field: 'body_text', quote: signal.quote },
      ...(current
        ? { operation: 'revise' as const, id: current.id, expectedVersion: current.version }
        : { operation: 'create' as const }),
    }
    return [{ ...common, review: { command, title: state.title }, blocked: null }]
  })
  return { proposals, nextBeforeId: page.nextBeforeId }
}

export async function scanCommitmentProposals(client: LedgerSession, before: string | null) {
  const page = await ledgerRpc(client, 'scan_commitment_mail', { p_before_id: before }) as ScanPage
  const signals = interpretScan(page)
  const references = [...new Set(signals.flatMap(signal => signal.reference ? [signal.reference] : []))]
  const targets = references.length ? await ledgerRpc(client, 'read_commitment_lifecycle_targets', { p_references: references }) : []
  return buildProposals(page, signals, targets)
}
