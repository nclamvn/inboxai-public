import type { NextRequest } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { privateJson, readPrivateJson } from '@/lib/http/private-json'
import { triageCommand } from '@/lib/gmail-triage/contracts'
import { gmailTriageEnabled, gmailTriageStore, TriageError } from '@/lib/gmail-triage/server'

export const maxDuration = 45

async function authenticated(request: NextRequest, operation: (actor: string) => Promise<Response>) {
  if (!gmailTriageEnabled()) return privateJson({ error: 'Đồng bộ thao tác Gmail chưa bật.' }, 404)
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return privateJson({ error: 'Yêu cầu đăng nhập.' }, 401)
    return await operation(user.id)
  } catch (error) {
    if (error instanceof TriageError && error.code === 'PT404') return privateJson({ error: 'Không tìm thấy thư hoặc thao tác.' }, 404)
    if (error instanceof TriageError && error.code === 'PT409') return privateJson({ error: 'Thao tác đang chờ xử lý hoặc trạng thái thư đã thay đổi.' }, 409)
    if (error instanceof TriageError && error.code === '22023') return privateJson({ error: 'Yêu cầu không hợp lệ.' }, 400)
    return privateJson({ error: 'Chưa kiểm tra được kết quả. Hãy thử lại.' }, 503)
  }
}

export async function GET(request: NextRequest) {
  return authenticated(request, async actor => privateJson({ jobs: await gmailTriageStore(actor).list() }))
}

export async function POST(request: NextRequest) {
  return authenticated(request, async actor => {
    const body = await readPrivateJson(request)
    if (body instanceof Response) return body
    const command = triageCommand.safeParse(body.body)
    if (!command.success) return privateJson({ error: 'Yêu cầu không hợp lệ.' }, 400)
    return privateJson({ job: await gmailTriageStore(actor).execute(command.data) })
  })
}
