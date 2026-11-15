import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { scanCatchupProposals } from '@/lib/commitments/detection-server'
import { ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'

const filters = z.object({
  accounts: z.array(z.uuid()).max(50),
  before: z.uuid().nullable(),
  source: z.uuid().nullable(),
})
const dismissal = z.strictObject({ emailId: z.uuid(), token: z.uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) })

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const params = request.nextUrl.searchParams
    const result = filters.safeParse({
      accounts: params.getAll('account'), before: params.get('beforeId'), source: params.get('source'),
    })
    if (!result.success) return ledgerJson({ error: 'Bộ lọc theo dõi không hợp lệ.' }, 400)
    const { accounts, before, source } = result.data
    return ledgerJson(await scanCatchupProposals(client, accounts, before, source))
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const result = dismissal.safeParse(await readCommitmentJson(request))
    if (!result.success) return ledgerJson({ error: 'Dữ liệu xác nhận không hợp lệ.' }, 400)
    const { emailId, token, hash } = result.data
    return ledgerJson(await ledgerRpc(client, 'dismiss_commitment_catchup', {
      p_email: emailId, p_token: token, p_hash: hash,
    }))
  })
}
