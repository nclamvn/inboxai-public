import type { NextRequest } from 'next/server'
import { commitmentReceipt, requestKey } from '@/lib/commitments/contracts'
import { purchaseCommand } from '@/lib/commitments/purchase-order'
import { ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    const command = purchaseCommand.safeParse(await readCommitmentJson(request))
    if (!key.success || !command.success) return ledgerJson({ error: 'Thông tin duyệt đơn không hợp lệ.' }, 400)
    const result = await ledgerRpc(client, 'confirm_purchase_order', { p_request_key: key.data, p_command: command.data })
    return ledgerJson(commitmentReceipt.parse(result))
  })
}
