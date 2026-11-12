import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { privateJson, readPrivateJson } from '@/lib/http/private-json'
import { lookupCategories, lookupQueryLimit } from '@/lib/search/mail-lookup'
import { createClientForRequest } from '@/lib/supabase/server'

const requestSchema = z.strictObject({
  query: z.string().trim().max(lookupQueryLimit),
  accounts: z.array(z.uuid()).max(20),
  category: z.enum(lookupCategories).nullable(),
  hasFile: z.boolean(),
  before: z.strictObject({
    rank: z.int().min(0).max(2),
    at: z.union([z.iso.datetime({ offset: true }), z.literal('-infinity')]),
    id: z.uuid(),
  }).nullable(),
})

export async function POST(request: NextRequest) {
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return privateJson({ error: 'Yêu cầu đăng nhập.' }, 401)

  const body = await readPrivateJson(request)
  if (body instanceof Response) return body
  const input = requestSchema.safeParse(body.body)
  if (!input.success) return privateJson({ error: 'Bộ lọc tìm kiếm không hợp lệ.' }, 400)

  const { query, accounts, category, hasFile, before } = input.data
  const { data, error } = await client.rpc('search_synced_mail', {
    p_query: query, p_accounts: accounts, p_category: category, p_has_file: hasFile,
    p_before_rank: before?.rank ?? null, p_before_at: before?.at ?? null, p_before_id: before?.id ?? null,
  }).abortSignal(AbortSignal.timeout(8_000))

  if (error?.code === 'PT404') return privateJson({ error: 'Không tìm thấy tài khoản trong phạm vi tìm kiếm.' }, 404)
  if (error) return privateJson({ error: 'Chưa tải được kết quả tìm kiếm. Bạn có thể thử lại.' }, 503)
  return privateJson(data)
}
