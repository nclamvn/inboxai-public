import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export type GoogleOAuthFlow = 'connect' | 'add-account' | 'enable-send' | 'reconnect'
type ConnectFlow = Extract<GoogleOAuthFlow, 'connect' | 'add-account'>
const sendBinding = z.object({ accountId: z.uuid(), revision: z.number().int().positive() })
type SendBinding = z.infer<typeof sendBinding>
const reconnectBinding = sendBinding.extend({
  surface: z.enum(['inbox', 'outbox']), includeSend: z.boolean(), includeModify: z.boolean(),
})
type ReconnectBinding = z.infer<typeof reconnectBinding>
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
function createState(userId: string, flow: GoogleOAuthFlow, now: number, binding?: SendBinding) {
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ userId, flow, state, verifier, issuedAt: now, binding })).toString('base64url')
  return {
    state,
    cookie: `${payload}.${sign(payload)}`,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  }
}

export function createOAuthState(userId: string, flow: ConnectFlow, now = Date.now()) {
  return createState(userId, flow, now)
}

export function createGoogleSendState(userId: string, binding: SendBinding, now = Date.now()) {
  return createState(userId, 'enable-send', now, sendBinding.parse(binding))
}

/** Fail closed before exchanging any authorization code. */
function validateState(
  state: string | null,
  cookie: string | undefined,
  userId: string,
  flow: GoogleOAuthFlow,
  now = Date.now(),
) {
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
    return { verifier: data.verifier as string, binding: data.binding as unknown }
  } catch {
    return null
  }
}

export function validateOAuthState(state: string | null, cookie: string | undefined, userId: string,
  flow: ConnectFlow, now = Date.now()) {
  return validateState(state, cookie, userId, flow, now)?.verifier ?? null
}

export function validateGoogleSendState(state: string | null, cookie: string | undefined, userId: string, now = Date.now()) {
  const validated = validateState(state, cookie, userId, 'enable-send', now)
  if (!validated) return null
  const binding = sendBinding.safeParse(validated.binding)
  return binding.success ? { ...binding.data, verifier: validated.verifier } : null
}

export function createGoogleReconnectState(userId: string, binding: ReconnectBinding) {
  return createState(userId, 'reconnect', Date.now(), reconnectBinding.parse(binding))
}

export function validateGoogleReconnectState(state: string | null, cookie: string, userId: string) {
  const validated = validateState(state, cookie, userId, 'reconnect')
  if (!validated) return null
  const binding = reconnectBinding.safeParse(validated.binding)
  return binding.success ? { ...binding.data, verifier: validated.verifier } : null
}
