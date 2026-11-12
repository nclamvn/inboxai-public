import type { NextRequest } from 'next/server'
import { commitmentId, commitmentReceipt, requestKey } from '@/lib/commitments/contracts'
import { confirmDetection, scanCommitmentProposals } from '@/lib/commitments/detection-server'
import { ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const before = commitmentId.nullable().safeParse(request.nextUrl.searchParams.get('beforeId'))
    if (!before.success) return ledgerJson({ error: 'Trang thư không hợp lệ.' }, 400)
    return ledgerJson(await scanCommitmentProposals(client, before.data))
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    if (!key.success) return ledgerJson({ error: 'Thiếu mã yêu cầu hợp lệ.' }, 400)
    const command = confirmDetection.safeParse(await readCommitmentJson(request))
    if (!command.success) return ledgerJson({ error: 'Đề xuất hoặc email nguồn không hợp lệ.' }, 400)
    const proposal = command.data
    const creating = proposal.operation === 'create'
    const result = await ledgerRpc(client, 'confirm_commitment_detection', {
      p_request_key: key.data, p_email_id: proposal.evidence.emailId, p_fingerprint: proposal.sourceFingerprint,
      p_id: creating ? null : proposal.id, p_version: creating ? null : proposal.expectedVersion,
      p_reference_key: proposal.referenceKey, p_state: proposal.state, p_evidence: [proposal.evidence],
    })
    const receipt = commitmentReceipt.parse(result)
    return ledgerJson(receipt, creating && !receipt.replayed ? 201 : 200)
  })
}
