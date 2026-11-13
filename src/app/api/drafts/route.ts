import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'
import { composeRpcError } from '@/lib/compose/server'

const query = z.object({
  account: z.uuid().nullable(),
  before: z.iso.datetime({ offset: true }).nullable(),
  beforeId: z.uuid().nullable(),
}).refine(value => Boolean(value.before) === Boolean(value.beforeId))
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest) {
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return Response.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401, headers })
  const params = request.nextUrl.searchParams
  const parsed = query.safeParse({ account: params.get('account'), before: params.get('before'), beforeId: params.get('beforeId') })
  if (!parsed.success) return Response.json({ error: 'Bộ lọc bản nháp không hợp lệ.' }, { status: 400, headers })

  const { data, error } = await client.rpc('list_mail_drafts', {
    p_account: parsed.data.account, p_before: parsed.data.before, p_before_id: parsed.data.beforeId,
  }).abortSignal(AbortSignal.timeout(8_000))
  if (error) {
    const failure = composeRpcError(error.code)
    return Response.json({ error: failure.message }, { status: failure.status, headers })
  }
  return Response.json({ items: data.slice(0, 40), more: data.length > 40 }, { headers })
}
