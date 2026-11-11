import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { privateJson, readPrivateJson } from '@/lib/http/private-json'
import { operatorActionInput } from '@/lib/operator/validation'
import { operatorRpc, withOperatorSession } from '@/lib/operator/http'

type Context = { params: Promise<{ planId: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  return withOperatorSession(request, async client => {
    const id = z.uuid().safeParse((await params).planId)
    if (!id.success) return privateJson({ error: 'Mã kế hoạch không hợp lệ.' }, 400)
    const result = await operatorRpc(client, 'read_operator_plan', { p_id: id.data })
    return result instanceof Response ? result : privateJson(result)
  })
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return withOperatorSession(request, async client => {
    const id = z.uuid().safeParse((await params).planId)
    if (!id.success) return privateJson({ error: 'Mã kế hoạch không hợp lệ.' }, 400)
    const body = await readPrivateJson(request)
    if (body instanceof Response) return body
    const input = operatorActionInput.safeParse(body.body)
    if (!input.success) return privateJson({ error: 'Yêu cầu phê duyệt hoặc thực thi không hợp lệ.' }, 400)
    const action = input.data
    const result = await operatorRpc(client, 'operator_plan_action', {
      p_id: id.data, p_phase: action.operation,
      p_scope_hash: action.operation === 'approve' ? action.previewHash : action.approvedHash,
      p_selected: action.operation === 'approve' ? action.selectedIds : null,
    })
    return result instanceof Response ? result : privateJson(result)
  })
}
