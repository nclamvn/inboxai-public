import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { privateJson, readPrivateJson } from '@/lib/http/private-json'
import { ruleCategories } from '@/lib/personal-mail/contracts'
import { createClientForRequest } from '@/lib/supabase/server'

const source = {
  emailId: z.uuid(),
  category: z.enum(ruleCategories),
  includeExisting: z.boolean(),
}
const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('manual'), emailId: z.uuid(), category: z.enum(ruleCategories) }),
  z.strictObject({ action: z.literal('preview'), ...source }),
  z.strictObject({ action: z.literal('confirm'), ...source, id: z.uuid(), token: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.strictObject({ action: z.literal('undo'), id: z.uuid() }),
])

export async function GET(request: NextRequest) {
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return privateJson({ error: 'Yêu cầu đăng nhập.' }, 401)
  const { data, error } = await client.rpc('list_personal_mail_rules')
  return error ? privateJson({ error: 'Chưa tải được quy tắc.' }, 503) : privateJson(data)
}

export async function POST(request: NextRequest) {
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return privateJson({ error: 'Yêu cầu đăng nhập.' }, 401)

  const body = await readPrivateJson(request)
  if (body instanceof Response) return body
  const parsed = commandSchema.safeParse(body.body)
  if (!parsed.success) return privateJson({ error: 'Yêu cầu đổi nhãn không hợp lệ.' }, 400)

  const command = parsed.data
  let result
  if (command.action === 'undo') {
    result = await client.rpc('undo_personal_mail_rule', { p_id: command.id })
  } else if (command.action === 'manual') {
    result = await client.rpc('set_personal_mail_category', { p_emails: [command.emailId], p_category: command.category })
  } else {
    const params = { p_email: command.emailId, p_category: command.category, p_existing: command.includeExisting }
    result = command.action === 'preview'
      ? await client.rpc('preview_personal_mail_rule', params)
      : await client.rpc('confirm_personal_mail_rule', { ...params, p_id: command.id, p_token: command.token })
  }

  if (!result.error) return privateJson(result.data)
  switch (result.error.code) {
    case 'PT404': return privateJson({ error: 'Không tìm thấy thư hoặc quy tắc.' }, 404)
    case 'PT409': return privateJson({
      error: command.action === 'preview'
        ? 'Người gửi này đã có quy tắc trong tài khoản. Bạn có thể quản lý quy tắc từ Hộp thư.'
        : 'Phạm vi đã thay đổi. Hãy xem trước lại hoặc kiểm tra danh sách quy tắc.',
    }, 409)
    case '22023': return privateJson({ error: 'Yêu cầu đổi nhãn không hợp lệ.' }, 400)
    default: return privateJson({ error: 'Chưa xác nhận được kết quả. Bạn có thể thử lại.' }, 503)
  }
}
