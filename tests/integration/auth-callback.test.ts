import { beforeEach, expect, it, vi } from 'vitest'
const exchange = vi.hoisted(() => vi.fn(async () => ({ error:null })))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth:{ exchangeCodeForSession: exchange } }) }))
import { GET } from '@/app/auth/callback/route'
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'))

it.each(['@attacker.example', 'https://attacker.example', '//attacker.example', '/\\attacker.example'])('refuses external redirect %j', async next => {
  const response = await GET(new Request(`http://localhost:3000/auth/callback?code=synthetic&next=${encodeURIComponent(next)}`))
  expect(response.headers.get('location')).toBe('http://localhost:3000/inbox')
})
it('preserves an ordinary same-origin destination', async () => {
  const response = await GET(new Request('http://localhost:3000/auth/callback?code=synthetic&next=%2Fsettings'))
  expect(response.headers.get('location')).toBe('http://localhost:3000/settings')
})
it('uses the configured app origin rather than an internal or attacker-supplied host', async () => {
  const response = await GET(new Request('http://internal-proxy/auth/callback?code=synthetic'))
  expect(response.headers.get('location')).toBe('http://localhost:3000/inbox')
})
