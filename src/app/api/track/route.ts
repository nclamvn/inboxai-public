import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackBehavior, type BehaviorAction } from '@/lib/ai/behavior-tracker'
import { logEmailAction, type ActionType } from '@/lib/ai/domain-reputation'
import { privateJson, readPrivateJson } from '@/lib/http/private-json'

const actionMap: Record<BehaviorAction, ActionType | null> = {
  open: 'open', reply: 'reply', archive: 'archive', delete: 'delete', read: null, star: null, unstar: null,
}
const trackingInput = z.object({
  emailId: z.uuid(),
  action: z.enum(['open', 'read', 'reply', 'archive', 'delete', 'star', 'unstar']),
  readDuration: z.number().int().min(0).max(2_147_483_647).optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return privateJson({ error: 'Unauthorized' }, 401)

  const body = await readPrivateJson(request)
  if (body instanceof Response) return body
  const input = trackingInput.safeParse(body.body)
  if (!input.success) return privateJson({ error: 'Invalid tracking request' }, 400)

  try {
    const result = await trackBehavior({ userId: user.id, ...input.data })
    if (!result) return privateJson({ error: 'Email not found' }, 404)
    const domainAction = actionMap[input.data.action]
    if (domainAction && result.sender) await logEmailAction(user.id, input.data.emailId, result.sender, domainAction)
    return privateJson({ success: true })
  } catch {
    return privateJson({ error: 'Tracking failed' }, 500)
  }
}
