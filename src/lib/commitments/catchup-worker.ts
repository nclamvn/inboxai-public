import 'server-only'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { detectCommitments, senderIdentity } from './detect'

type Work = { id: string; token: string; sender: string; body: string; receivedAt: string | null }

// The queue was committed with the sync page. A worker failure leaves it pending
// for the next attempt, and the database rejects results for superseded snapshots.
export async function processCommitmentCatchup(userId: string) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.rpc('pending_commitment_catchup', { p_actor: userId })
    .abortSignal(AbortSignal.timeout(3_000))
  if (error || !Array.isArray(data) || data.length === 0) return
  const results = (data as Work[]).map(({ id, token, sender, body, receivedAt }) => ({
    id, token,
    hashes: senderIdentity(sender) ? detectCommitments(body, receivedAt)
      .map(signal => createHash('sha256').update(signal.quote).digest('hex')) : [],
  }))
  await db.rpc('finish_commitment_catchup', { p_actor: userId, p_results: results })
    .abortSignal(AbortSignal.timeout(3_000))
}
