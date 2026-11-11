import type { NextRequest } from 'next/server'
import { isCommitmentGroup } from '@/lib/commitments/view'
import { commitmentId, createCommitment, pageLimit, requestKey } from '@/lib/commitments/contracts'
import { ledgerJson, ledgerRpc, readCommitmentJson, saveCommitment, withLedgerSession } from '@/lib/commitments/http'

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const limit = pageLimit.safeParse(request.nextUrl.searchParams.get('limit') ?? '20')
    const before = commitmentId.nullable().safeParse(request.nextUrl.searchParams.get('beforeId'))
    if (!limit.success || !before.success) return ledgerJson({ error: 'Phân trang không hợp lệ.' }, 400)
    const group = request.nextUrl.searchParams.get('group')
    if (group !== null) {
      if (!isCommitmentGroup(group)) return ledgerJson({ error: 'Nhóm cam kết không hợp lệ.' }, 400)
      return ledgerJson(await ledgerRpc(client, 'list_commitment_board', {
        p_group: group, p_limit: limit.data, p_before_id: before.data,
      }))
    }
    return ledgerJson(await ledgerRpc(client, 'list_commitments', { p_limit: limit.data, p_before_id: before.data }))
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    if (!key.success) return ledgerJson({ error: 'Thiếu mã yêu cầu hợp lệ.' }, 400)
    const command = createCommitment.safeParse(await readCommitmentJson(request))
    if (!command.success) return ledgerJson({ error: 'Thông tin cam kết hoặc nguồn không hợp lệ.' }, 400)
    const { referenceKey, state, evidence } = command.data
    return saveCommitment(client, {
      p_request_key: key.data, p_id: null, p_version: null, p_reference_key: referenceKey,
      p_state: state, p_review: null, p_evidence: evidence,
    }, true)
  })
}
