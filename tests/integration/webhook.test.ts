import { createHmac } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const client = vi.hoisted(() => vi.fn(() => { throw new Error('Unexpected DB call') }))
vi.mock('@supabase/supabase-js', () => ({ createClient: client }))
import { POST } from '@/app/api/webhooks/resend/route'

const key = Buffer.from('synthetic-webhook-signing-secret')
const secret = `whsec_${key.toString('base64')}`
const payload = JSON.stringify({ type: 'unhandled.synthetic', data: {} })
function request(body = payload, age = 0, signature?: string) {
  const timestamp = String(Math.floor(Date.now() / 1000) + age)
  const id = 'msg_synthetic'
  const sig = signature ?? `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64')}`
  return new NextRequest('http://localhost/api/webhooks/resend', {
    method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': sig },
  })
}

it('fails closed without signing secret, including development', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
  expect((await POST(request())).status).toBe(503)
  expect(client).not.toHaveBeenCalled()
})
it.each(['bad signature', 'changed body', 'stale', 'future'])('rejects %s before DB work', async kind => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', secret)
  const req = request(kind === 'changed body' ? payload + ' ' : payload, kind === 'stale' ? -601 : kind === 'future' ? 601 : 0, kind === 'bad signature' ? 'x' : undefined)
  expect((await POST(req)).status).toBe(401)
  expect(client).not.toHaveBeenCalled()
})
it('accepts an authentic Svix-format signature using real SDK verification', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', secret)
  expect((await POST(request())).status).toBe(200)
})
