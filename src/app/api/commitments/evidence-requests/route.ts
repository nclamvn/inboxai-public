import type { NextRequest } from 'next/server'
import { ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'
import { evidenceRequestContext, evidenceRequestInput } from '@/lib/commitments/purchase-evidence-request'

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const input = evidenceRequestInput.safeParse({ caseId: request.nextUrl.searchParams.get('case') })
    if (!input.success) return ledgerJson({ error: 'Chọn hồ sơ cần bổ sung.' }, 400)
    return ledgerJson(evidenceRequestContext.parse(await ledgerRpc(client, 'read_purchase_evidence_request', { p_case: input.data.caseId })))
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const input = evidenceRequestInput.safeParse(await readCommitmentJson(request))
    if (!input.success) return ledgerJson({ error: 'Yêu cầu bổ sung không hợp lệ.' }, 400)
    return ledgerJson(evidenceRequestContext.parse(await ledgerRpc(client, 'prepare_purchase_evidence_request', { p_case: input.data.caseId })))
  })
}
