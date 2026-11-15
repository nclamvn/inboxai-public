import type { NextRequest } from 'next/server'
import { commitmentId, historyCursor, pageLimit, requestKey, reviseCommitment } from '@/lib/commitments/contracts'
import { ledgerJson, ledgerRpc, readCommitmentJson, saveCommitment, withLedgerSession } from '@/lib/commitments/http'

type Context = { params: Promise<{ commitmentId: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  return withLedgerSession(request, async client => {
    const id = commitmentId.safeParse((await params).commitmentId)
    const limit = pageLimit.safeParse(request.nextUrl.searchParams.get('limit') ?? '20')
    const before = historyCursor.nullable().safeParse(request.nextUrl.searchParams.get('beforeVersion'))
    if (!id.success || !limit.success || !before.success) return ledgerJson({ error: 'Tham số không hợp lệ.' }, 400)
    return ledgerJson(await ledgerRpc(client, 'read_commitment', {
      p_id: id.data, p_limit: limit.data, p_before_version: before.data,
    }))
  })
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return withLedgerSession(request, async client => {
    const id = commitmentId.safeParse((await params).commitmentId)
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    if (!id.success || !key.success) return ledgerJson({ error: 'Mã cam kết hoặc mã yêu cầu không hợp lệ.' }, 400)
    const command = reviseCommitment.safeParse(await readCommitmentJson(request))
    if (!command.success) return ledgerJson({ error: 'Phiên bản, thay đổi hoặc nguồn không hợp lệ.' }, 400)
    return saveCommitment(client, {
      p_request_key: key.data, p_id: id.data, p_version: command.data.expectedVersion, p_reference_key: null,
      p_state: command.data.operation === 'revise' ? command.data.state : null,
      p_review: command.data.operation === 'flag_review' ? command.data.review : null,
      p_evidence: command.data.evidence,
    })
  })
}
