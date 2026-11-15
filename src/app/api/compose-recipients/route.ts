import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'
import { collectRecentRecipients, matchRecentRecipients } from '@/lib/compose/recipient-history'
import { recipientQueryLimit } from '@/lib/compose/recipients'

const filter = z.strictObject({ account: z.uuid(), q: z.string().trim().min(2).max(recipientQueryLimit) })
const history = z.object({ account: z.string(), messages: z.array(z.object({ to: z.unknown(), cc: z.unknown() })).max(160) })
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: NextRequest) {
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return json({ error: 'Yêu cầu đăng nhập.' }, 401)
    const params = filter.safeParse({ account: request.nextUrl.searchParams.get('account'), q: request.nextUrl.searchParams.get('q') })
    if (!params.success) return json({ error: 'Tài khoản hoặc từ khóa không hợp lệ.' }, 400)
    const { account, q } = params.data
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8_000)])
    const read = await client.rpc('read_compose_recipient_history', { p_account: account }).abortSignal(signal)
    const parsed = history.safeParse(read.data)
    if (read.error?.code === 'PT404') return json({ error: 'Không tìm thấy tài khoản gửi.' }, 404)
    if (read.error || !parsed.success) throw new Error('History unavailable')
    const entries = collectRecentRecipients(parsed.data.messages, parsed.data.account)
    const unnamed = entries.filter(entry => !entry.name).slice(0, 160).map(entry => entry.address.toLowerCase())
    let names: Record<string, string> = {}
    if (unnamed.length) {
      const result = await client.rpc('read_compose_recipient_names', { p_account: account, p_addresses: unnamed }).abortSignal(signal)
      if (result.error) throw new Error('Names unavailable')
      names = result.data ?? {}
    }
    return json({ owner: user.id, account: parsed.data.account, items: matchRecentRecipients(entries, names, q) })
  } catch {
    return json({ error: 'Chưa tải được gợi ý người nhận.' }, 503)
  }
}
