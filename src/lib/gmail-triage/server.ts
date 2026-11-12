import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getGoogleCredential } from '@/lib/gmail/credentials'
import { canModifyGmail, canReadGmail } from '@/lib/gmail/scopes'
import { flags, type TriageCommand, type TriageJob } from './contracts'
import { gmailLabels, GmailTriageError, labelRevision } from './provider'

export function gmailTriageEnabled() {
  return process.env.INBOXAI_GMAIL_TRIAGE_ENABLED === '1'
}

const claimSchema = z.object({
  account_id: z.uuid(), provider_id: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/), lease: z.uuid(),
  flag: flags, desired: z.boolean(), expected: z.boolean().nullable(),
  expected_revision: labelRevision.nullable(), before_revision: labelRevision.nullable(),
  receipt_revision: labelRevision.nullable(),
})
type Snapshot = Awaited<ReturnType<ReturnType<typeof gmailLabels>['read']>>

export class TriageError extends Error {
  constructor(readonly code: string) { super('Inbox triage request failed') }
}

export function gmailTriageStore(actor: string) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(name, { p_actor: actor, ...args }).abortSignal(AbortSignal.timeout(4000))
    if (error) throw new TriageError(error.code)
    return data
  }

  const list = (id?: string) => rpc('gmail_triage_list', { p_id: id ?? null }) as Promise<TriageJob[]>
  async function read(id: string) {
    const [job] = await list(id)
    if (!job) throw new TriageError('PT404')
    return job
  }

  async function processItem(job: TriageJob, emailId: string, deadline: AbortSignal) {
    const keys = { p_job: job.id, p_email: emailId }
    const claimed = await rpc('gmail_triage_claim', keys)
    if (!claimed) return
    const item = claimSchema.parse(claimed)
    const record = (step: string, details: Record<string, unknown> = {}) =>
      rpc('gmail_triage_record', { ...keys, p_lease: item.lease, p_step: step, ...details })
    const finish = (state: 'verified' | 'conflict', snapshot: Snapshot, result?: string) =>
      record(state, { p_revision: snapshot.revision, p_flags: snapshot.flags, p_result: result ?? null })
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(10_000)])
    try {
      const credential = await getGoogleCredential(actor, item.account_id, signal)
      if (!credential) return await record('pending')
      if (!canReadGmail(credential.scope)) return await record('blocked')
      const provider = gmailLabels(credential.accessToken, item.provider_id, signal)
      const before = await provider.read()
      if (before.unavailable) return await record('gone')

      // A durable pre-write snapshot and a new read resolve an uncertain write.
      // A changed message revision never triggers another write on replay.
      if (item.before_revision !== null && before.revision !== item.before_revision) {
        if (BigInt(before.revision) < BigInt(item.before_revision)) return await record('pending')
        if (before.flags[item.flag] !== item.desired) return await finish('conflict', before)
        return await finish('verified', before, before.revision === item.receipt_revision ? 'applied' : 'reconciled')
      }
      if (item.receipt_revision !== null) return await record('pending')
      if (item.expected_revision !== null && before.revision !== item.expected_revision) {
        return await finish('conflict', before)
      }
      const current = before.flags[item.flag]
      if (current === item.desired) return await finish('verified', before, 'unchanged')
      if (item.expected !== null && current !== item.expected) return await finish('conflict', before)
      if (!canModifyGmail(credential.scope)) return await record('blocked')

      if (item.before_revision === null) {
        await record('before', { p_revision: before.revision, p_before: current })
      }
      signal.throwIfAborted()
      const receipt = await provider.change(item.flag, item.desired)
      if (receipt.flags[item.flag] === item.desired && BigInt(receipt.revision) > BigInt(before.revision)) {
        await record('receipt', { p_revision: receipt.revision })
      }
      const observed = await provider.read()
      if (observed.unavailable) return await record('gone')
      if (BigInt(observed.revision) < BigInt(receipt.revision) || observed.revision === before.revision) {
        return await record('pending')
      }
      if (observed.flags[item.flag] !== item.desired) return await finish('conflict', observed)
      return await finish('verified', observed, observed.revision === receipt.revision &&
        receipt.flags[item.flag] === item.desired ? 'applied' : 'reconciled')
    } catch (error) {
      if (error instanceof GmailTriageError && error.status === 404) return await record('gone')
      if (error instanceof GmailTriageError && [401, 403].includes(error.status)) return await record('blocked')
      // A failed acknowledgement leaves the durable target available for read-back.
      return await record('pending')
    }
  }

  async function execute(command: TriageCommand) {
    let id = command.id
    if (command.action !== 'check') {
      const applying = command.action === 'apply'
      const created = await rpc('gmail_triage_create', {
        p_id: applying ? id : null, p_undo: applying ? null : id,
        p_flag: applying ? command.flag : null, p_desired: applying ? command.desired : null,
        p_ids: applying ? [...command.emailIds].sort() : null,
      })
      id = z.uuid().parse(created)
    }
    const job = await read(id)
    const targets = job.items.filter(item => item.state === 'pending')
    const deadline = AbortSignal.timeout(25_000)
    for (let start = 0; start < targets.length && !deadline.aborted; start += 6) {
      await Promise.allSettled(targets.slice(start, start + 6).map(item => processItem(job, item.emailId, deadline)))
    }
    return read(id)
  }
  return { list, execute }
}
