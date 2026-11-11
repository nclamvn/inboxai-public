import 'server-only'
import type { NextRequest } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { privateJson } from '@/lib/http/private-json'

type Session = Awaited<ReturnType<typeof createClientForRequest>>
type Rpc = 'create_operator_plan' | 'list_operator_plans' | 'read_operator_plan' | 'operator_plan_action'

export async function withOperatorSession(request: NextRequest, handle: (client: Session) => Promise<Response>) {
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return privateJson({ error: 'Yêu cầu đăng nhập.' }, 401)
    return await handle(client)
  } catch {
    return privateJson({ error: 'Chưa nhận được kết quả. Hãy thử lại cùng yêu cầu.' }, 503)
  }
}

export async function operatorRpc(client: Session, name: Rpc, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10_000))
  if (!error && data != null) return data
  switch (error?.code) {
    case '42501':
      return privateJson({ error: 'Yêu cầu đăng nhập.' }, 401)
    case 'PT404':
      return privateJson({ error: 'Kế hoạch hoặc tài khoản email không khả dụng.' }, 404)
    case 'PT409':
      return privateJson({ error: 'Phạm vi hoặc trạng thái phê duyệt không khớp. Kiểm tra lại kế hoạch.' }, 409)
    case '22023':
    case '22007':
    case '22008':
    case '22P02':
      return privateJson({ error: 'Thông tin kế hoạch không hợp lệ.' }, 400)
    default:
      return privateJson({ error: 'Chưa nhận được kết quả. Hãy thử lại cùng yêu cầu.' }, 503)
  }
}
