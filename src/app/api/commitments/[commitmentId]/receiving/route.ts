import type { NextRequest } from 'next/server'
import { commitmentId, commitmentReceipt, receivingCommand, requestKey } from '@/lib/commitments/contracts'
import { ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'

type Context = { params: Promise<{ commitmentId: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  return withLedgerSession(request, async client => {
    const id = commitmentId.safeParse((await params).commitmentId)
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    const command = receivingCommand.safeParse(await readCommitmentJson(request))
    if (!id.success || !key.success || !command.success) return ledgerJson({ error: 'Thông tin đối soát không hợp lệ.' }, 400)
    const rpc = command.data.operation === 'correct' ? 'confirm_commitment_warehouse_correction' : 'confirm_commitment_receiving'
    const result = await ledgerRpc(client, rpc, {
      p_id: id.data, p_request_key: key.data, p_command: command.data,
    })
    return ledgerJson(commitmentReceipt.parse(result))
  })
}
