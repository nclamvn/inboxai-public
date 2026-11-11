import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signUp: vi.fn(), signOut: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signUp: mocks.signUp, signOut: mocks.signOut } }) }))
import { POST as signup } from '@/app/api/signup-whitelist/route'
import { POST as check } from '@/app/api/check-whitelist/route'

const body = { email: 'Alice@Example.test', password: 'Synthetic-passphrase-123', fullName: 'Alice Example' }
const request = (value: unknown = body) => new NextRequest('http://localhost/api/signup-whitelist', { method: 'POST', body: JSON.stringify(value) })
beforeEach(() => {
  vi.stubEnv('SIGNUP_ENABLED', 'true')
  vi.stubEnv('SIGNUP_RATE_LIMIT_KEY', 'synthetic-rate-limit-key-at-least-32-characters')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'consume_registration_attempt' ? true : { enabled: true, allowed: true }, error: null }))
  mocks.signUp.mockResolvedValue({ data: { user: { id: 'synthetic' }, session: null }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ external: { email: true }, disable_signup: false, mailer_autoconfirm: false }))))
})

it('requires deliberate enablement before any request work', async () => {
  vi.stubEnv('SIGNUP_ENABLED', 'false')
  expect((await signup(request())).status).toBe(503)
  expect((await check(request({ email: body.email }))).status).toBe(503)
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it.each([{}, null, { ...body, email: 123 }, { ...body, password: 'short' }, { ...body, app_metadata: { role: 'admin' } }])('rejects invalid or privilege-bearing input %j', async input => {
  expect((await signup(request(input))).status).toBe(400)
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.signUp).not.toHaveBeenCalled()
})
it('uses the normal verification flow with normalized email and configured callback', async () => {
  const response = await signup(request())
  expect(response.status).toBe(202)
  expect((await response.json()).requires_email_verification).toBe(true)
  expect(mocks.signUp).toHaveBeenCalledWith({ email: 'alice@example.test', password: body.password,
    options: { data: { full_name: body.fullName }, emailRedirectTo: 'http://localhost:3000/auth/callback' } })
  expect(mocks.rpc.mock.calls[0][1]).toEqual({ p_ip_key: expect.stringMatching(/^[a-f0-9]{64}$/), p_email_key: expect.stringMatching(/^[a-f0-9]{64}$/) })
})
it.each(['missing policy', 'policy error', 'disabled policy', 'capacity/whitelist denial', 'throttled', 'missing rate key'])('fails closed for %s', async kind => {
  if (kind === 'missing rate key') vi.stubEnv('SIGNUP_RATE_LIMIT_KEY', '')
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'consume_registration_attempt') return { data: kind !== 'throttled', error: null }
    return { data: kind === 'missing policy' ? null : { enabled: kind !== 'disabled policy', allowed: kind !== 'capacity/whitelist denial' }, error: kind === 'policy error' ? { message: 'internal' } : null }
  })
  const response = await signup(request())
  expect(response.status).toBe(kind === 'throttled' ? 429 : kind === 'capacity/whitelist denial' ? 403 : 503)
  expect(mocks.signUp).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it.each([{ mailer_autoconfirm: true }, {}, { mailer_autoconfirm: false, disable_signup: true }, { mailer_autoconfirm: false, disable_signup: false, external: { email: false } }])('rejects unsafe/unknown Auth settings %j before signup', async settings => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(settings))))
  expect((await signup(request())).status).toBe(503)
  expect(mocks.signUp).not.toHaveBeenCalled()
})
it('signs out an unexpected immediate session and returns no session or credentials', async () => {
  mocks.signUp.mockResolvedValue({ data: { session: { access_token: 'must-not-leak' } }, error: null })
  const response = await signup(request())
  expect(response.status).toBe(503)
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
  expect(await response.text()).not.toContain('must-not-leak')
})
it('does not expose provider errors or enumerate existing accounts', async () => {
  mocks.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null })
  expect((await signup(request())).status).toBe(202)
  mocks.signUp.mockResolvedValue({ data: null, error: { message: 'sensitive internal account data', status: 400 } })
  expect(await (await signup(request())).text()).not.toContain('sensitive')
})
it('email preflight no longer lists users or exposes counts/existence', async () => {
  const response = await check(request({ email: body.email }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(expect.objectContaining({ allowed: true, status: 'verification_required' }))
  expect(mocks.signUp).not.toHaveBeenCalled()
})
it('preserves the waitlist path when admission is denied', async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ data:name === 'consume_registration_attempt' ? true : { enabled:true, allowed:false }, error:null }))
  const response = await check(request({ email:body.email }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(expect.objectContaining({ allowed:false, status:'not_found' }))
  expect(mocks.signUp).not.toHaveBeenCalled()
})
