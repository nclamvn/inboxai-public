import type { NextRequest } from 'next/server'
import { ledgerJson, ledgerRpc, withLedgerSession } from '@/lib/commitments/http'
import { purchaseDuesPage } from '@/lib/commitments/purchase-dues'

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const page = request.nextUrl.searchParams.get('page') ?? '0'
    if (!/^(0|[1-9][0-9]{0,3}|10000)$/.test(page)) return ledgerJson({ error: 'Trang không hợp lệ.' }, 400)
    const data = await ledgerRpc(client, 'list_purchase_dues', { p_page: Number(page) })
    return ledgerJson(purchaseDuesPage.parse(data))
  })
}
