import type { NextRequest } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { AskQueryError, parseAskQuery } from '@/lib/search/ask-query'
import { askReply, readAskRequest } from '@/lib/search/ask-http'
import type { WarehouseAnswer } from '@/lib/search/ask-answer-contracts'
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

    if (plan.plan.warehouse) {
      const { data, error } = await client.rpc('ask_warehouse_reconciliation', {
        p_reference: plan.plan.reference, p_filters: filters,
      }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]))
      if (error?.code === 'PT404') return askReply({ error: 'Tài khoản email không khả dụng.' }, 404)
      if (error) return askReply({ error: 'Chưa đối chiếu được sổ nhập kho. Hãy thử lại.' }, 503)
      const warehouse = data?.supplier ? data as WarehouseAnswer : null
      return askReply({ reference: plan.plan.reference, status: warehouse ? 'answered' : 'insufficient',
        reason: null, examined: warehouse ? warehouse.receipts.length + 1 : 0, limited: false, claims: [], warehouse })
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
