import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { privateJson, readPrivateJson } from '@/lib/http/private-json'
import { operatorPlanInput } from '@/lib/operator/validation'
import { operatorRpc, withOperatorSession } from '@/lib/operator/http'
import { parseOperatorCommand } from '@/lib/operator/plan-command'

export async function GET(request: NextRequest) {
  return withOperatorSession(request, async client => {
    const result = await operatorRpc(client, 'list_operator_plans')
    return result instanceof Response ? result : privateJson(result)
  })
}

export async function POST(request: NextRequest) {
  return withOperatorSession(request, async client => {
    const key = z.uuidv4().safeParse(request.headers.get('Idempotency-Key'))
    if (!key.success) return privateJson({ error: 'Thiếu mã yêu cầu hợp lệ.' }, 400)
    const body = await readPrivateJson(request)
    if (body instanceof Response) return body
    const input = operatorPlanInput.safeParse(body.body)
    if (!input.success) return privateJson({ error: 'Lệnh hoặc tài khoản email không hợp lệ.' }, 400)
    const spec = parseOperatorCommand(input.data.command, input.data.accountId)
    if (!spec) return privateJson({ error: 'Dùng lệnh lưu trữ hoặc đánh dấu đã đọc, kèm số ngày, ngày cụ thể hoặc email người gửi.' }, 400)
    const result = await operatorRpc(client, 'create_operator_plan', {
      p_request_key: key.data, p_action: spec.action, p_account: spec.accountId, p_days: spec.olderThanDays,
      p_before: spec.beforeDate, p_sender: spec.sender, p_keep_attachments: spec.keepAttachments,
    })
    if (result instanceof Response) return result
    if (result.status === 'empty') return privateJson({ error: 'Không tìm thấy thư phù hợp với phạm vi này.' }, 422)
    if (result.status === 'too_broad') return privateJson({ error: 'Phạm vi vượt quá 40 thư. Hãy chọn một tài khoản hoặc thu hẹp điều kiện.' }, 422)
    return privateJson(result, result.replayed ? 200 : 201)
  })
}
