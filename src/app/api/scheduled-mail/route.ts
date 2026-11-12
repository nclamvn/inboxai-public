import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'
import { SendError } from '@/lib/mail-send/contracts'
import { checkScheduledMail, scheduledError } from '@/lib/scheduled-mail/server'

const id = z.uuid()
const version = z.number().int().positive().max(2_147_483_647)
const actions = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('move'), id, version, at: z.iso.datetime() }),
  z.strictObject({ action: z.literal('cancel'), id, version }),
  z.strictObject({ action: z.literal('check'), id }),
])
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

async function authenticated(request: NextRequest, run: (client: Awaited<ReturnType<typeof createClientForRequest>>, actor: string) => Promise<Response>) {
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return json({ error: 'Yêu cầu đăng nhập.' }, 401)
    return await run(client, user.id)
  } catch (error) {
    const failure = error instanceof SendError ? error : scheduledError('unavailable')
    return json({ error: failure.message }, failure.status)
  }
}

export async function GET(request: NextRequest) {
  return authenticated(request, async client => {
    const { data, error } = await client.rpc('list_scheduled_mail').abortSignal(AbortSignal.timeout(8000))
    if (error) throw scheduledError(error.code)
    return json(data)
  })
}

export async function POST(request: NextRequest) {
  return authenticated(request, async (client, actor) => {
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      return json({ error: 'Nội dung phải là JSON.' }, 415)
    }
    // The route accepts only metadata. Cap the body even without Content-Length.
    const reader = request.body?.getReader()
    if (!reader) return json({ error: 'Yêu cầu không hợp lệ.' }, 400)
    let body = ''
    const decoder = new TextDecoder()
    let bytes = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > 2048) {
          await reader.cancel()
          return json({ error: 'Yêu cầu quá lớn.' }, 413)
        }
        body += decoder.decode(chunk.value, { stream: true })
      }
    } finally {
      reader.releaseLock()
    }
    let raw: unknown
    try { raw = JSON.parse(body + decoder.decode()) } catch { return json({ error: 'Yêu cầu không hợp lệ.' }, 400) }
    const parsed = actions.safeParse(raw)
    if (!parsed.success) return json({ error: 'Yêu cầu không hợp lệ.' }, 400)
    const action = parsed.data
    if (action.action === 'check') {
      const response = await checkScheduledMail(actor, action.id)
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    const { error } = await client.rpc('change_scheduled_mail', {
      p_id: action.id, p_version: action.version, p_action: action.action, p_at: action.action === 'move' ? action.at : null,
    }).abortSignal(AbortSignal.timeout(8000))
    if (error) throw scheduledError(error.code)
    return json({ ok: true })
  })
}
