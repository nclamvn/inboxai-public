import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createOAuthState, validateOAuthState, oauthCookieName, oauthCookieOptions } from '@/lib/oauth/state'
import { getGoogleAuthUrl, exchangeCodeForTokens } from '@/lib/oauth/google'

const now = Date.UTC(2026, 10, 11)
beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'synthetic-client-secret')
  vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic.apps.googleusercontent.com')
  vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:3000/api/auth/google/callback')
})
afterEach(() => vi.useRealTimers())

describe('browser, user and flow bound OAuth state', () => {
  it('generates unpredictable independent state and PKCE secrets', () => {
    const a = createOAuthState('alice', 'connect', now)
    const b = createOAuthState('alice', 'connect', now)
    const verifier = validateOAuthState(a.state, a.cookie, 'alice', 'connect', now)!
    expect(a.state).not.toBe(b.state)
    expect(a.cookie).not.toContain(a.state)
    expect(a.state).not.toBe(verifier)
    expect(a.challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it.each([
    ['missing state', null, undefined, 'alice', 'connect', now],
    ['legacy forged state', Buffer.from('{"userId":"alice"}').toString('base64'), undefined, 'alice', 'connect', now],
  ] as const)('rejects %s', (_name, state, cookie, user, flow, time) => {
    expect(validateOAuthState(state, cookie, user, flow, time)).toBeNull()
  })

  it.each(['missing cookie', 'wrong state', 'wrong browser', 'tamper', 'other user', 'other flow', 'expired', 'future', 'oversized'])('rejects %s', kind => {
    const t = createOAuthState('alice', 'connect', now)
    const cookie = kind === 'missing cookie' ? undefined : kind === 'wrong browser' ? createOAuthState('alice', 'connect', now).cookie : kind === 'tamper' ? t.cookie + 'x' : t.cookie
    const time = kind === 'expired' ? now + 300_000 : kind === 'future' ? now - 1 : now
    const state = kind === 'wrong state' ? 'forged' : kind === 'oversized' ? 'x'.repeat(129) : t.state
    expect(validateOAuthState(state, cookie, kind === 'other user' ? 'bob' : 'alice', kind === 'other flow' ? 'add-account' : 'connect', time)).toBeNull()
  })

  it('rejects cookies signed with the previous key', () => {
    const t = createOAuthState('alice', 'connect', now)
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'rotated-secret')
    expect(validateOAuthState(t.state, t.cookie, 'alice', 'connect', now)).toBeNull()
  })

  it('uses host-only secure cookies in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(oauthCookieName('connect')).toMatch(/^__Host-/)
    expect(oauthCookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300 })
    expect(oauthCookieOptions()).not.toHaveProperty('domain')
  })

  it('puts only the PKCE challenge on the authorization URL and verifier in token request', async () => {
    const t = createOAuthState('alice', 'connect', now)
    const verifier = validateOAuthState(t.state, t.cookie, 'alice', 'connect', now)!
    const url = new URL(getGoogleAuthUrl(t.state, undefined, t.challenge))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(t.challenge)
    expect(url.searchParams.get('state')).toBe(t.state)
    expect(url.toString()).not.toContain(verifier)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'synthetic', expires_in: 3600 })))
    vi.stubGlobal('fetch', fetch)
    await exchangeCodeForTokens('test-code', undefined, verifier)
    const body = fetch.mock.calls[0][1].body as URLSearchParams
    expect(body.get('code_verifier')).toBe(verifier)
  })
})
