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
  fingerprint: string; usedQuotes: string[]; manualUsed: boolean; catchupToken?: string | null
}
type Signal = {
  source: Source; sender: string; signal: DetectionSignal; reference: string | null; key: string; quoteHash: string
}
type Target = {
  reference: string; referenceKey: string; id: string; version: number; state: LedgerState; lastSourceAt: string | null
  receiptNumbers?: string[]; originAt?: string | null; supplierAt?: string | null
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
    const signals = detectCommitments(source.body, source.receivedAt, reference)
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
      signal.kind === 'create' && signal.delivery && target.state.delivery && target.originSender === sender
    ) || (
      target.originAccountId === source.accountId && target.originSender === sender
    ) || (
      target.state.ownerEmail?.toLowerCase() === sender &&
      (target.originAccountId === source.accountId || target.originSender !== sender)
    ))
    const open = (signal.delivery && signal.kind !== 'create' || (signal.kind === 'review' && reference?.startsWith('PO-'))
      ? related.filter(target => target.state.delivery)
      : matching).filter(target => target.state.status === 'open' && target.state.ownerEmail?.toLowerCase() === sender)
    const receiptTargets = signal.receipt ? related.filter(target => target.state.delivery && target.state.status === 'open' &&
      target.state.receiving?.accountId === source.accountId && target.state.receiving?.sender === sender) : []
    const candidates = signal.receipt ? receiptTargets : open
    const current = signal.kind !== 'create' && candidates.length === 1 ? candidates[0] : null
    const at = source.at && Number.isFinite(Date.parse(source.at)) ? source.at : null
    const common = {
      proposalId: source.id + ':' + quoteHash,
      emailId: source.id, accountId: source.accountId, commitmentId: current?.id ?? null,
      subject: source.subject, sender, at, quote: signal.quote,
      kind: signal.kind, reference, proposedDueOn: signal.kind === 'review' ? signal.dueOn : null,
      proposedBatch: signal.proposedBatch ?? null, previous: current?.state ?? null,
      ...(source.catchupToken ? { catchupToken: source.catchupToken } : {}),
    }
    if (related.length > 8 || (signal.kind !== 'create' && (candidates.length > 1 || (signal.receipt && related.length > 1) || current?.multiOrigin))) {
      return [{ ...common, review: null, blocked: 'ambiguous' }]
    }
    if (signal.kind === 'create') {
      const title = commitmentTitleKey(signal.title!)
      if (matching.some(target => target.referenceKey === key || commitmentTitleKey(target.originTitle) === title)) return []
      if (matching.some(target => target.originId !== source.id)) return [{ ...common, review: null, blocked: 'ambiguous' }]
    }
    if (signal.receipt) {
      if (!current?.state.delivery || !current.state.receiving) return [{ ...common, review: null, blocked: 'warehouse' }]
      if (current.state.review) return [{ ...common, review: null, blocked: 'conflicting' }]
      const { delivery, receiving } = current.state
      const { number, amount, unit } = signal.receipt
      if (current.receiptNumbers?.includes(number)) return [{ ...common, review: null, blocked: 'duplicate_receipt' }]
      if (unit !== delivery.unit || receiving.received + amount > delivery.ordered) return [{ ...common, review: null, blocked: 'quantity' }]
      if (!source.receivedAt || !current.originAt || Date.parse(source.receivedAt) < Date.parse(current.originAt)) {
        return [{ ...common, review: null, blocked: 'chronology' }]
      }
      const { title, ownerName, ownerEmail, dueOn, dueAt, status } = current.state
      const state = { title, ownerName, ownerEmail, dueOn, dueAt, status, delivery }
      return [{ ...common, blocked: null, review: { title: state.title, command: {
        operation: 'receive', id: current.id, expectedVersion: current.version, emailId: source.id,
        sourceFingerprint: source.fingerprint, quote: signal.quote,
        state: { ...state, receiving: { ...receiving, received: receiving.received + amount } },
      } } }]
    }
    if (signal.kind !== 'create' && !current) return [{ ...common, review: null, blocked: 'unmatched' }]
    const latest = current?.state.receiving ? current.supplierAt : current?.lastSourceAt
    if (current && !(source.receivedAt && latest && Date.parse(source.receivedAt) > Date.parse(latest))) {
      return [{ ...common, review: null, blocked: 'chronology' }]
    }
    if (signal.kind === 'review' || (signal.kind === 'owner' && current?.state.receiving))
      return [{ ...common, review: null, blocked: 'uncertain' }]
    if (signal.kind === 'deadline' && current?.state.delivery && !signal.priorDueOn)
      return [{ ...common, review: null, blocked: 'uncertain' }]
    if (signal.priorDueOn && current?.state.dueOn !== signal.priorDueOn) {
      return [{ ...common, review: null, blocked: 'conflicting' }]
    }
    if (signal.delivery && current && (current.state.delivery?.ordered !== signal.delivery.ordered ||
      current.state.delivery.unit !== signal.delivery.unit)) return [{ ...common, review: null, blocked: 'quantity' }]
    if (signal.kind === 'completed' && !signal.delivery && current?.state.delivery)
      return [{ ...common, review: null, blocked: 'quantity' }]
    if (signal.delivery && current?.state.delivery && signal.delivery.delivered < current.state.delivery.delivered)
      return [{ ...common, review: null, blocked: 'quantity' }]
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
  return proposalsForPage(client, page)
}

export async function scanCatchupProposals(client: LedgerSession, accounts: string[], before: string | null, source: string | null, focus = false) {
  const page = await ledgerRpc(client, 'read_commitment_catchup', {
    p_accounts: accounts, p_before_id: before, p_source_id: source, p_focus: focus,
  }) as ScanPage
  return proposalsForPage(client, page)
}

async function proposalsForPage(client: LedgerSession, page: ScanPage) {
  const signals = interpretScan(page)
  const references = [...new Set(signals.flatMap(signal => signal.reference ? [signal.reference] : []))]
  const targets = references.length ? await ledgerRpc(client, 'read_commitment_lifecycle_targets', { p_references: references }) : []
  return buildProposals(page, signals, targets)
}
