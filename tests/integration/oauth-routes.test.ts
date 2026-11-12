import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createOAuthState, oauthCookieName } from '@/lib/oauth/state'

const mocks = vi.hoisted(() => ({
  user: { id: 'alice' } as { id: string } | null,
  exchange: vi.fn(),
  info: vi.fn(),
  from: vi.fn(),
  saveError: null as null | { message: string },
  save: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user: mocks.user } }) }, from: mocks.from,
})) }))
vi.mock('@/lib/credential-vault/accounts', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/credential-vault/accounts')>(), saveGoogleConnection: mocks.save,
}))
vi.mock('@/lib/oauth/google', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/oauth/google')>(),
  exchangeCodeForTokens: mocks.exchange,
  getGoogleUserInfo: mocks.info,
}))

import { GET as connect } from '@/app/api/auth/google/route'
import { GET as connectCallback } from '@/app/api/auth/google/callback/route'
import { POST as add } from '@/app/api/source-accounts/google/route'
import { GET as addCallback } from '@/app/api/source-accounts/google/callback/route'

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'synthetic-secret')
  vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic-client')
  vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:3000/api/auth/google/callback')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  mocks.user = { id: 'alice' }
  mocks.saveError = null
  mocks.save.mockImplementation(async () => { if (mocks.saveError) throw new Error('Credential unavailable'); return 'account-a' })
  mocks.exchange.mockResolvedValue({ access_token: 'synthetic-token', expires_in: 3600 })
  mocks.info.mockResolvedValue({ email: 'alice@example.test', name: 'Alice' })
  const chain = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'account-a' } }),
    update: vi.fn().mockReturnThis(),
    then(resolve: (value: { error: typeof mocks.saveError }) => unknown) {
      return Promise.resolve({ error: mocks.saveError }).then(resolve)
    },
  }
  mocks.from.mockReturnValue(chain)
})

describe.each([
  { flow: 'connect' as const, callback: connectCallback, path: '/api/auth/google/callback' },
  { flow: 'add-account' as const, callback: addCallback, path: '/api/source-accounts/google/callback' },
])('$flow callback', ({ flow, callback, path }) => {
  it.each(['missing', 'forged', 'no cookie', 'wrong browser', 'other user', 'other flow', 'expired', 'future'])('rejects %s before exchange and DB access', async kind => {
    const now = Date.now()
    const transaction = createOAuthState(kind === 'other user' ? 'bob' : 'alice', kind === 'other flow' ? (flow === 'connect' ? 'add-account' : 'connect') : flow,
      kind === 'expired' ? now - 301_000 : kind === 'future' ? now + 60_000 : now)
    const params = new URLSearchParams({ code: 'synthetic-code' })
    if (kind !== 'missing') params.set('state', kind === 'forged' ? Buffer.from('{"user_id":"alice"}').toString('base64') : transaction.state)
    const cookie = kind === 'wrong browser' ? createOAuthState('alice', flow).cookie : transaction.cookie
    const request = new NextRequest(`http://localhost:3000${path}?${params}`, {
      headers: kind === 'no cookie' ? {} : { cookie: `${oauthCookieName(flow)}=${cookie}` },
    })
    const response = await callback(request)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('invalid_state')
    expect(response.cookies.get(oauthCookieName(flow))?.value).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('requires an authenticated user', async () => {
    mocks.user = null
    const response = await callback(new NextRequest(`http://localhost:3000${path}?code=x&state=y`))
    expect(response.headers.get('location')).toContain('/login')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('accepts a bound transaction, supplies verifier, and consumes the browser cookie', async () => {
    const t = createOAuthState('alice', flow)
    const response = await callback(new NextRequest(`http://localhost:3000${path}?code=test&state=${t.state}`, {
      headers: { cookie: `${oauthCookieName(flow)}=${t.cookie}` },
    }))
    expect(mocks.exchange).toHaveBeenCalledWith('test', flow === 'connect' ? undefined : 'http://localhost:3000/api/source-accounts/google/callback', expect.stringMatching(/^[A-Za-z0-9_-]{43}$/))
    expect(response.headers.get('location')).toContain('success=')
    expect(response.cookies.get(oauthCookieName(flow))?.value).toBe('')
  })

  it('clears the transaction on provider denial', async () => {
    const response = await callback(new NextRequest(`http://localhost:3000${path}?error=access_denied`))
    expect(response.cookies.get(oauthCookieName(flow))?.value).toBe('')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('does not report success when credential persistence fails', async () => {
    mocks.saveError = { message: 'synthetic database failure' }
    const t = createOAuthState('alice', flow)
    const response = await callback(new NextRequest(`http://localhost:3000${path}?code=test&state=${t.state}`, {
      headers: { cookie: `${oauthCookieName(flow)}=${t.cookie}` },
    }))
    expect(response.headers.get('location')).toContain('error=')
    expect(response.headers.get('location')).not.toContain('success=')
    expect(response.cookies.get(oauthCookieName(flow))?.value).toBe('')
  })
})

it('both initiation routes issue HTTP-only cookies and PKCE URLs', async () => {
  const a = await connect()
  const b = await add()
  const urls = [a.headers.get('location')!, (await b.json()).auth_url]
  for (const url of urls) {
    const params = new URL(url).searchParams
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('scope')?.split(' ')).toEqual([
      'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email',
    ])
    expect(params.get('include_granted_scopes')).toBeNull()
  }
  expect(a.cookies.get(oauthCookieName('connect'))?.httpOnly).toBe(true)
  expect(b.cookies.get(oauthCookieName('add-account'))?.httpOnly).toBe(true)
})
