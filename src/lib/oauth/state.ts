import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type GoogleOAuthFlow = 'connect' | 'add-account'
export const OAUTH_TTL_SECONDS = 300

function signingKey(): string {
  const key = process.env.GOOGLE_CLIENT_SECRET
  if (!key) throw new Error('Missing Google OAuth configuration')
  return key
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url')
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function oauthCookieName(flow: GoogleOAuthFlow): string {
  return `${process.env.NODE_ENV === 'production' ? '__Host-' : ''}inboxai-google-${flow}`
}

export function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: OAUTH_TTL_SECONDS,
  }
}

/** The verifier stays in a signed, HTTP-only browser cookie, never in the URL. */
export function createOAuthState(userId: string, flow: GoogleOAuthFlow, now = Date.now()) {
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ userId, flow, state, verifier, issuedAt: now })).toString('base64url')
  return {
    state,
    cookie: `${payload}.${sign(payload)}`,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  }
}

/** Fail closed before exchanging any authorization code. */
export function validateOAuthState(
  state: string | null,
  cookie: string | undefined,
  userId: string,
  flow: GoogleOAuthFlow,
  now = Date.now(),
): string | null {
  if (!state || !cookie || cookie.length > 2048 || state.length > 128) return null
  try {
    const parts = cookie.split('.')
    if (parts.length !== 2 || !equal(parts[1], sign(parts[0]))) return null
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (data.userId !== userId || data.flow !== flow || typeof data.state !== 'string' ||
        !equal(data.state, state) || typeof data.issuedAt !== 'number' ||
        !Number.isFinite(data.issuedAt) || data.issuedAt > now ||
        now - data.issuedAt >= OAUTH_TTL_SECONDS * 1000 ||
        typeof data.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.verifier)) return null
    return data.verifier as string
  } catch {
    return null
  }
}
