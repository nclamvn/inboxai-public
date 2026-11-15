import type { NextRequest } from 'next/server'
import { ledgerJson, withLedgerSession } from '@/lib/commitments/http'
import { supplementCases, supplementScan } from '@/lib/commitments/purchase-supplement'
import { scanSupplements } from '@/lib/commitments/purchase-supplement-server'

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const cases = supplementCases.safeParse(request.nextUrl.searchParams.getAll('case'))
    if (!cases.success) return ledgerJson({ error: 'Chọn từ một đến bốn hồ sơ khác nhau.' }, 400)
    return ledgerJson(supplementScan.parse(await scanSupplements(client, actor, cases.data, request.signal)))
  })
}
