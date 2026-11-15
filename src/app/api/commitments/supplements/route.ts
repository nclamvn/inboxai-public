import type { NextRequest } from 'next/server'
import { ledgerJson, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'
import { supplementCases, supplementReview, supplementScan } from '@/lib/commitments/purchase-supplement'
import { advanceSupplementReview, scanSupplements } from '@/lib/commitments/purchase-supplement-server'

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async (_, actor) => {
    const cases = supplementCases.safeParse(request.nextUrl.searchParams.getAll('case'))
    if (!cases.success) return ledgerJson({ error: 'Chọn từ một đến bốn hồ sơ khác nhau.' }, 400)
    return ledgerJson(supplementScan.parse(await scanSupplements(actor, cases.data, request.signal)))
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async (_, actor) => {
    const review = supplementReview.safeParse(await readCommitmentJson(request))
    if (!review.success) return ledgerJson({ error: 'Yêu cầu rà soát không hợp lệ.' }, 400)
    const scan = await advanceSupplementReview(actor, review.data.caseId, review.data.invoiceId, request.signal)
    return ledgerJson(supplementScan.element.parse(scan))
  })
}
