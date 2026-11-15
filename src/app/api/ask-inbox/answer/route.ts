import type { NextRequest } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { AskQueryError, parseAskQuery } from '@/lib/search/ask-query'
import { askReply, readAskRequest } from '@/lib/search/ask-http'
import type { PurchaseOrderAnswer, WarehouseAnswer } from '@/lib/search/ask-answer-contracts'
import { emptyAskAnswer, planAskAnswer, synthesizeAskAnswer, type AnswerEvidence } from '@/lib/search/ask-answer'

export async function POST(request: NextRequest) {
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return askReply({ error: 'Yêu cầu đăng nhập.' }, 401)
  const input = await readAskRequest(request)
  if (input instanceof Response) return input
  try {
    if (!input.query.trim()) return askReply(emptyAskAnswer('reference_required'))
    const { query, filters } = parseAskQuery(input)
    const plan = planAskAnswer(query)
    if ('reason' in plan) return askReply(emptyAskAnswer(plan.reason))

    if (plan.plan.payment) {
      const { data: payment, error } = await client.rpc('ask_purchase_payment', {
        p_reference: plan.plan.reference, p_filters: filters,
      }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]))
      if (error?.code === 'PT404') return askReply({ error: 'Tài khoản email không khả dụng.' }, 404)
      if (error || !payment) return askReply({ error: 'Chưa đọc được bộ chứng từ.' }, 503)
      if (payment.status !== 'no_dossier') {
        return askReply({ reference: plan.plan.reference, status: payment.lines ? 'answered' : 'insufficient',
          reason: null, examined: payment.sources?.length ?? 0, limited: false, claims: [], payment })
      }
    }

    if (plan.plan.warehouse) {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
      const args = { p_reference: plan.plan.reference, p_filters: filters }
      const { data: purchaseData, error: purchaseError } = await client.rpc('ask_purchase_order', args).abortSignal(signal)
      if (purchaseError?.code === 'PT404') return askReply({ error: 'Tài khoản email không khả dụng.' }, 404)
      if (purchaseError) return askReply({ error: 'Chưa đối chiếu được các dòng đơn mua hàng. Hãy thử lại.' }, 503)
      if (purchaseData?.lines || purchaseData?.unavailable) {
        const purchase = purchaseData.lines ? purchaseData as PurchaseOrderAnswer : null
        return askReply({ reference: plan.plan.reference, status: purchase ? 'answered' : 'insufficient',
          reason: null, examined: purchase?.sources.length ?? 0, limited: false, claims: [], purchase })
      }
      const { data, error } = await client.rpc('ask_warehouse_reconciliation', args).abortSignal(signal)
      if (error?.code === 'PT404') return askReply({ error: 'Tài khoản email không khả dụng.' }, 404)
      if (error) return askReply({ error: 'Chưa đối chiếu được sổ nhập kho. Hãy thử lại.' }, 503)
      const warehouse = data?.supplier ? data as WarehouseAnswer : null
      return askReply({ reference: plan.plan.reference, status: warehouse ? 'answered' : 'insufficient',
        reason: null, examined: warehouse ? warehouse.receipts.length + warehouse.corrections.length + 1 : 0, limited: false, claims: [], warehouse })
    }

    const { data, error } = await client.rpc('ask_inbox_reference_evidence', {
      p_reference: plan.plan.reference, p_filters: filters,
    }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]))
    if (error?.code === 'PT404') return askReply({ error: 'Tài khoản email không khả dụng.' }, 404)
    if (error || !data || !Array.isArray(data.sources)) return askReply({ error: 'Chưa đọc được email nguồn. Hãy thử lại.' }, 503)
    return askReply(synthesizeAskAnswer(plan.plan, data as AnswerEvidence))
  } catch (error) {
    if (error instanceof AskQueryError) return askReply({ error: error.message }, 400)
    return askReply({ error: 'Chưa đối chiếu được email nguồn. Hãy thử lại.' }, 503)
  }
}
