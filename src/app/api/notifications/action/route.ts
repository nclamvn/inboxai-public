import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CommitmentRequestError, ledgerJson, readCommitmentJson, withLedgerSession, type LedgerSession } from '@/lib/commitments/http'
import { readActionNotifications, readNotificationRpc } from '@/lib/notifications/action-server'

const markSeen = z.strictObject({ id: z.string().regex(/^[0-9a-f]{64}$/) })

function withNotifications(request: NextRequest, handle: (client: LedgerSession, owner: string) => Promise<Response>) {
  return withLedgerSession(request, async (client, owner) => {
    try {
      return await handle(client, owner)
    } catch (error) {
      if (error instanceof CommitmentRequestError && error.status < 500) throw error
      return ledgerJson({ error: 'Chưa tải được thông báo. Hãy thử lại.' }, 503)
    }
  })
}

export function GET(request: NextRequest) {
  return withNotifications(request, async (client, owner) => {
    const items = await readActionNotifications(client)
    const seen: Record<string, string> = items.length
      ? await readNotificationRpc(client, 'read_action_notification_seen', { p_keys: items.map(item => item.id) })
      : {}
    return ledgerJson({ owner, items: items.map(item => ({ ...item, seenAt: seen[item.id] ?? null })) })
  })
}

export function PATCH(request: NextRequest) {
  return withNotifications(request, async (client, owner) => {
    const parsed = markSeen.safeParse(await readCommitmentJson(request))
    if (!parsed.success) return ledgerJson({ error: 'Thông báo không hợp lệ.' }, 400)
    const { id } = parsed.data
    const seen = await readNotificationRpc(client, 'read_action_notification_seen', { p_keys: [id] })
    if (seen[id]) return ledgerJson({ seen: true })
    if (!(await readActionNotifications(client)).some(item => item.id === id)) {
      return ledgerJson({ error: 'Thông báo đã thay đổi. Hãy làm mới danh sách.' }, 404)
    }
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await service.rpc('mark_action_notification_seen', { p_actor: owner, p_key: id })
      .abortSignal(AbortSignal.timeout(8_000))
    if (error || data !== true) return ledgerJson({ error: 'Chưa ghi được trạng thái đã xem. Hãy thử lại.' }, 503)
    return ledgerJson({ seen: true })
  })
}
