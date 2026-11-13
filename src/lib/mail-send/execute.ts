import 'server-only'
import type { MailSendStore } from './store'
import { SendOperationMissing, type MailPayload, type SendScope, type SendOutcome, type SendReceipt } from './contracts'

export async function executeMailSend(
  store: MailSendStore,
  scope: SendScope,
  prepare: () => Promise<{ payload: MailPayload; dispatch: (receipt: SendReceipt) => Promise<SendOutcome> }>,
  findSent: (receipt: SendReceipt) => Promise<string | null>,
  onAccepted?: () => Promise<void>,
  checkOnly = false,
) {
  async function replay(receipt: SendReceipt) {
    if (!receipt.reconcile) return receipt
    try {
      const providerId = await findSent(receipt)
      if (providerId) return await store.finish(scope, receipt, { state: 'accepted', providerId })
    } catch {
      // Missing evidence, lookup failure and uncertain acknowledgement keep the same operation.
    }
    return receipt
  }

  const previous = await store.begin(scope)
  if (previous) return replay(previous)
  if (checkOnly) throw new SendOperationMissing()
  const { payload, dispatch } = await prepare()
  const receipt = await store.begin(scope, payload)
  if (!receipt) throw new Error('Missing send receipt')
  if (!receipt.claimed) return replay(receipt)

  let outcome: SendOutcome
  try {
    outcome = await dispatch(receipt)
  } catch {
    outcome = { state: 'unknown' }
  }
  try {
    const saved = await store.finish(scope, receipt, outcome)
    if (saved.state === 'accepted' && onAccepted) {
      try { await onAccepted() } catch { /* Reputation never changes the send result. */ }
    }
    return saved
  } catch {
    // The write may already have committed. The same key can recover the authoritative state.
    return { ...receipt, claimed: false, state: 'unknown' as const }
  }
}
