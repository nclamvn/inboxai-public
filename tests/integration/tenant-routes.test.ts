import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const accountA = '10000000-0000-4000-8000-000000000001'
const accountB = '10000000-0000-4000-8000-000000000002'
const foreignEmail = '20000000-0000-4000-8000-000000000002'
const requestKey = '30000000-0000-4000-8000-000000000001'
const mocks = vi.hoisted(() => ({
  user: { id: 'alice' } as { id: string; email?: string; app_metadata?: Record<string, unknown> } | null,
  from: vi.fn(), send: vi.fn(), secret: vi.fn(), trust: vi.fn(), upsert: vi.fn(), rpc: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock('@/lib/email/smtp-client', () => ({ sendEmailViaSMTP: mocks.send }))
vi.mock('@/lib/email/imap-client', () => ({ EMAIL_PROVIDERS: {} }))
vi.mock('@/lib/credential-vault/vault', () => ({ getImapPassword: mocks.secret }))
vi.mock('@/lib/ai/sender-trust', () => ({ markSenderAsTrusted: mocks.trust }))
vi.mock('@/lib/resend/waitlist-emails', () => ({ sendWaitlistApproval: vi.fn() }))

import { POST as send } from '@/app/api/emails/send/route'
import { POST as settings } from '@/app/api/admin/ai-settings/route'
import { GET as whitelist } from '@/app/api/admin/whitelist/route'
import { GET as debugGmail } from '@/app/api/debug/gmail-sync/route'

beforeEach(() => {
  mocks.user = { id: 'alice' }
  mocks.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data: name === 'begin_mail_send' && !args.p_payload ? null : {
      id: requestKey, provider: 'smtp', state: name === 'finish_mail_send' ? 'accepted' : 'dispatching',
      messageId: '<test@inboxai.invalid>', providerId: null, reconcile: false, claimed: name === 'begin_mail_send',
    },
  }))
  mocks.send.mockResolvedValue({ success: true, messageId: 'synthetic-message' })
  mocks.secret.mockResolvedValue('synthetic-password')
  mocks.upsert.mockReturnValue({ select: () => ({ single: async () => ({ data: { user_id: 'alice' } }) }) })
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, string> = {}
    return {
      select() { return this },
      order: async () => ({ data: [] }),
      eq(key: string, value: string) { filters[key] = value; return this },
      async single() {
        if (table === 'source_accounts') {
          return { data: filters.user_id === 'alice' && filters.id === accountA ? {
            id: accountA, user_id: 'alice', is_active: true, smtp_host: 'smtp.example.test', email_address: 'alice@example.test', password_encrypted: 'synthetic',
          } : null }
        }
        if (table === 'emails') {
          const row = { id: foreignEmail, user_id: 'bob', subject: 'PRIVATE_BOB_SUBJECT', from_address: 'bob@example.test' }
          return { data: filters.id === row.id && (!filters.user_id || filters.user_id === row.user_id) ? row : null }
        }
        return { data: null }
      },
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: mocks.upsert,
    }
  })
})

const mailBody = { sourceAccountId: accountA, to: 'recipient@example.test', subject: 'Hello', text: 'Synthetic test' }
const req = (body: object) => new NextRequest('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': requestKey } })

it('foreign reply ID is rejected before decrypt, SMTP or sender-trust changes', async () => {
  const response = await send(req({ ...mailBody, replyToEmailId: foreignEmail }))
  expect(response.status).toBe(404)
  expect(await response.text()).not.toContain('PRIVATE_BOB_SUBJECT')
  expect(mocks.secret).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
  expect(mocks.trust).not.toHaveBeenCalled()
})
it('foreign sending account cannot be used', async () => {
  expect((await send(req({ ...mailBody, sourceAccountId: accountB }))).status).toBe(404)
  expect(mocks.send).not.toHaveBeenCalled()
})
it('ordinary own-account send still reaches mocked SMTP', async () => {
  expect((await send(req(mailBody))).status).toBe(200)
  expect(mocks.send).toHaveBeenCalledOnce()
})
it.each([{ user_id: 'bob' }, { user_id: null }, { id: 'foreign-row' }, { is_admin: true }, { phishing_score_threshold: '50' }, { low_confidence_threshold: 2 }])('rejects untrusted settings %j before privileged upsert', async body => {
  expect((await settings(req(body))).status).toBe(400)
  expect(mocks.upsert).not.toHaveBeenCalled()
})
it('valid settings use authenticated tenant only', async () => {
  expect((await settings(req({ phishing_score_threshold: 80 }))).status).toBe(200)
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'alice', phishing_score_threshold: 80 }), { onConflict: 'user_id' })
})
it('unauthenticated writes have no provider or DB work', async () => {
  mocks.user = null
  expect((await send(req(mailBody))).status).toBe(401)
  expect((await settings(req({ phishing_score_threshold: 80 }))).status).toBe(401)
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})

it('a formerly trusted email cannot reach global whitelist data without a server role', async () => {
  mocks.user = { id: 'alice', email: 'nclamvn@gmail.com', app_metadata: {} }
  expect((await whitelist(new NextRequest('http://localhost/api/admin/whitelist'))).status).toBe(403)
  expect(mocks.from).not.toHaveBeenCalled()
})
it('server-provisioned admin role can list whitelist data', async () => {
  mocks.user = { id: 'alice', app_metadata: { role: 'admin' } }
  expect((await whitelist(new NextRequest('http://localhost/api/admin/whitelist'))).status).toBe(200)
})
it('production debug endpoint is unavailable before credential or provider access', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  expect((await debugGmail(new NextRequest('http://localhost/api/debug/gmail-sync'))).status).toBe(404)
  expect(mocks.from).not.toHaveBeenCalled()
})
